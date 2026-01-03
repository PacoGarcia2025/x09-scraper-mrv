const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🚀 Iniciando Robô MRV - Versão MATEMÁTICA (Filtro por Tamanho)...');
  
  const browser = await puppeteer.launch({ 
    headless: "new",
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });
  
  const page = await browser.newPage();
  
  // 1. LISTAGEM
  console.log('📑 Acessando listagem...');
  await page.goto('https://www.mrv.com.br/imoveis/sao-paulo', { waitUntil: 'networkidle2', timeout: 90000 });
  
  try {
    const btn = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 4000 });
    if (btn) await btn.click();
  } catch (e) {}

  // Carrega lista
  for (let i = 0; i < 15; i++) {
    try {
      const btn = await page.waitForSelector('xpath///button[contains(., "Carregar")]', { timeout: 1500 });
      if (btn) { 
        await page.evaluate(el => el.click(), btn); 
        await new Promise(r => setTimeout(r, 1000)); 
      }
    } catch (e) { break; }
  }

  const linksParaVisitar = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/imoveis/"]'))
      .map(a => a.href)
      .filter((link, index, self) => link.length > 30 && self.indexOf(link) === index && !link.includes('lojas'));
  });

  console.log(`\n📋 ${linksParaVisitar.length} imóveis na fila.`);
  const dadosDetalhados = [];
  
  // 2. VISITAS
  for (let [index, link] of linksParaVisitar.entries()) {
    if (link.endsWith('/sao-paulo') || link.includes('lojas')) continue;

    console.log(`\n➡️ (${index+1}/${linksParaVisitar.length}) Visitando: ${link}`);
    
    try {
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // ROLAGEM LENTA (Essencial para carregar as fotos grandes)
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 400;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            // Clica em "Ver todos" nos diferenciais se aparecer
            const btnDiferenciais = [...document.querySelectorAll('button, span')].find(el => el.innerText === 'Ver todos');
            if(btnDiferenciais) btnDiferenciais.click();

            if (totalHeight >= document.body.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
      await new Promise(r => setTimeout(r, 2000));

      // --- EXTRAÇÃO ---
      const dadosPage = await page.evaluate((urlAtual) => {
        const dados = { url: urlAtual };

        // DADOS BÁSICOS
        const slug = urlAtual.split('/').pop();
        dados.id = 'MRV-' + slug.replace(/[^a-z0-9]/g, '').slice(-20);
        dados.titulo = slug.replace(/apartamentos-|casas-|lotes-/g, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        dados.tipo = 'Apartamento';
        if (slug.startsWith('casas')) dados.tipo = 'Casa';
        if (slug.startsWith('lotes')) dados.tipo = 'Lote';

        dados.cidade = urlAtual.split('/')[5].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        dados.estado = 'SP';
        
        const html = document.body.innerHTML;
        const text = document.body.innerText;

        // QUARTOS
        dados.quartos = (dados.tipo === 'Lote') ? '0' : '2';
        if (dados.tipo !== 'Lote') {
            const matchQ = html.match(/(\d)\s*Quartos/i);
            if (matchQ) dados.quartos = matchQ[1];
        }

        // STATUS
        dados.status = 'Em Obras';
        if (html.includes('Pronto para morar')) dados.status = 'Pronto para Morar';
        else if (html.includes('Lançamento')) dados.status = 'Lançamento';

        // ÁREA
        dados.area = '0';
        const areasMatches = [...html.matchAll(/(\d{2,3}[.,]?\d{0,2})\s*m²/g)];
        for (const m of areasMatches) {
            let valStr = m[1].replace(',', '.');
            let val = parseFloat(valStr);
            let maxArea = dados.tipo === 'Lote' ? 2000 : 400;
            if (val > 19 && val < maxArea) {
                dados.area = valStr;
                break; 
            }
        }

        // BAIRRO
        dados.bairro = 'A Consultar';
        dados.endereco = 'A Consultar';
        const matchEnd = html.match(/Endereço:<\/p><p>(.*?)<\/p>/) || html.match(/Endereço:<\/span><span>(.*?)<\/span>/);
        if (matchEnd) {
            dados.endereco = matchEnd[1].replace(/<[^>]*>?/gm, '').trim();
            const matchP = dados.endereco.match(/\((.*?)\)/);
            if (matchP) dados.bairro = matchP[1].split('-')[0].replace(/Região d[oa]/i, '').trim();
        } 
        if (dados.bairro === 'A Consultar') {
             const matchRegiao = text.match(/Região d[oa] ([A-ZÀ-Ú][a-zà-ú]+(?:\s[A-ZÀ-Ú][a-zà-ú]+)*)/);
             if (matchRegiao) dados.bairro = matchRegiao[1].trim();
        }

        // =========================================================
        // 📸 FOTOS: LÓGICA DE PIXELS (MATEMÁTICA)
        // =========================================================
        const todasImagens = Array.from(document.querySelectorAll('img'));
        
        let fotosBoas = todasImagens.filter(img => {
            // 1. Filtra lixo óbvio por nome (só o básico)
            const src = (img.src || img.getAttribute('data-src') || '').toLowerCase();
            if (!src.includes('cdn.mrv')) return false;
            if (src.includes('svg') || src.includes('icon') || src.includes('thumb')) return false;

            // 2. FILTRO MÁGICO: TAMANHO
            // Ícones geralmente tem 20px, 50px. Fotos reais tem mais de 300px.
            // Se a imagem não carregou o tamanho (naturalWidth 0), a gente aceita se for jpg/png/webp
            if (img.naturalWidth > 0 && img.naturalWidth < 300) return false; 
            if (img.naturalHeight > 0 && img.naturalHeight < 200) return false;

            return true;
        }).map(img => img.src || img.getAttribute('data-src'));

        // Pega até 20 fotos únicas
        dados.fotos = [...new Set(fotosBoas)].slice(0, 20);

        // =========================================================
        // 🏊‍♂️ DIFERENCIAIS: VARREDURA COMPLETA
        // =========================================================
        const listaDiferenciais = [
            'Churrasqueira', 'Pet Place', 'Piscina', 'Piscina Adulto', 'Piscina Infantil',
            'Varanda', 'Playground', 'Salão de Festas', 'Espaço Gourmet', 'Academia', 
            'Bicicletário', 'Pomar', 'Horta', 'Coworking', 'Brinquedoteca', 'Quadra',
            'Elevador', 'Energia Solar', 'Coleta Seletiva'
        ];
        
        // Procura no texto da página inteira
        dados.diferenciais = listaDiferenciais.filter(item => {
            // Cria regex que ignora maiúsculas/minúsculas
            const regex = new RegExp(item, 'i');
            return regex.test(text);
        });

        // DESCRIÇÃO
        const descEl = document.querySelector('#resumo-descricao');
        dados.descricao = descEl ? descEl.innerText.replace(/\n+/g, ' ').trim() : "";

        return dados;
      }, link);

      console.log(`   ✅ ${dadosPage.titulo.substring(0,25)}... | 📸 ${dadosPage.fotos.length} fotos | ✨ ${dadosPage.diferenciais.length} diferenciais`);
      dadosDetalhados.push(dadosPage);

    } catch (erro) {
      console.log(`❌ Erro: ${erro.message}`);
    }
  }

  fs.writeFileSync('mrv_imoveis.json', JSON.stringify(dadosDetalhados, null, 2));
  console.log(`\n💾 FIM!`);
  await browser.close();
})();
