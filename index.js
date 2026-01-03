const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🚀 Iniciando Robô MRV - Versão VIP (Foco na Galeria)...');
  
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
  console.log('👇 Carregando imóveis...');
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
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Rola para carregar galeria
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 500;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= 2000) { // Rola só o suficiente para carregar a galeria
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
      await new Promise(r => setTimeout(r, 1500));

      // --- EXTRAÇÃO ---
      const dadosPage = await page.evaluate((urlAtual) => {
        const dados = { url: urlAtual, diferenciais: [], fotos: [] };

        // DADOS BASICOS
        const slug = urlAtual.split('/').pop();
        // ID ROBUSTO: Usa o slug inteiro para evitar duplicidade
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

        // --- FOTOS: ESTRATÉGIA VIP (Só Galeria) ---
        // 1. Tenta pegar imagens APENAS dentro de containers de galeria conhecidos
        let containerImgs = Array.from(document.querySelectorAll('.slick-track img, .gallery img, .carousel img, figure img'));
        
        // Se não achou galeria específica, pega todas mas com filtro severo
        if (containerImgs.length === 0) {
            containerImgs = Array.from(document.querySelectorAll('img'));
        }

        let urlsFotos = containerImgs
            .map(img => img.src || img.getAttribute('data-src'))
            .filter(src => {
                if (!src || !src.includes('cdn.mrv')) return false;
                const lower = src.toLowerCase();

                // LISTA NEGRA: Ícones, logos, UI, diferenciais
                const lixo = [
                    'icon', 'logo', 'placeholder', 'avatar', 'thumb', 'mobile', 'svg', 'selo', 'banner',
                    'whatsapp', 'facebook', 'instagram', 'youtube', 'mapa', 'pin', 'seta', 'arrow', 
                    'fundo', 'footer', 'header', 'user', 'cliente', 'check', 'play', 'video', 
                    'diferenciais', 'lazer_icon' // Novos filtros
                ];
                if (lixo.some(p => lower.includes(p))) return false;

                // Tenta validar tamanho pela URL (se tiver info de width)
                // MRV costuma ter urls limpas, mas se for muito pequeno visualmente, ignora (difícil checar no headless)
                
                return true;
            });

        dados.fotos = [...new Set(urlsFotos)].slice(0, 15);
        if (dados.fotos.length === 0) {
            const capa = document.querySelector('img[alt*="Fachada"]');
            if (capa) dados.fotos.push(capa.src);
        }

        // DIFERENCIAIS
        const keywords = ['Churrasqueira', 'Pet Place', 'Piscina', 'Varanda', 'Playground', 'Salão de Festas', 'Academia'];
        dados.diferenciais = keywords.filter(key => text.includes(key));

        // DESCRIÇÃO
        const descEl = document.querySelector('#resumo-descricao');
        dados.descricao = descEl ? descEl.innerText.replace(/\n+/g, ' ').trim() : "";

        return dados;
      }, link);

      console.log(`   ✅ ${dadosPage.titulo.substring(0,25)}... | 📸 ${dadosPage.fotos.length} fotos`);
      dadosDetalhados.push(dadosPage);

    } catch (erro) {
      console.log(`❌ Erro: ${erro.message}`);
    }
  }

  fs.writeFileSync('mrv_imoveis.json', JSON.stringify(dadosDetalhados, null, 2));
  console.log(`\n💾 FIM!`);
  await browser.close();
})();