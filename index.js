const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🚀 Iniciando Robô MRV - Versão CLOUD (Automático)...');
  
  // CONFIGURAÇÃO PARA RODAR NO GITHUB ACTIONS
  const browser = await puppeteer.launch({ 
    headless: "new", // "new" é obrigatório para rodar na nuvem sem erro
    defaultViewport: null,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--start-maximized'
    ]
  });
  
  const page = await browser.newPage();
  
  // 1. LISTAGEM
  console.log('📑 Acessando listagem...');
  await page.goto('https://www.mrv.com.br/imoveis/sao-paulo', { waitUntil: 'networkidle2', timeout: 60000 });
  
  // Tenta fechar cookies se aparecer (não é garantido na nuvem, mas ajuda)
  try {
    const btn = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 3000 });
    if (btn) await btn.click();
  } catch (e) {}

  // Carrega mais imóveis (Tenta clicar no botão Carregar várias vezes)
  for (let i = 0; i < 15; i++) {
    try {
      const btn = await page.waitForSelector('xpath///button[contains(., "Carregar")]', { timeout: 1500 });
      if (btn) { 
        await page.evaluate(el => el.click(), btn); 
        await new Promise(r => setTimeout(r, 1000)); 
      }
    } catch (e) { break; }
  }

  // Coleta os links
  const linksParaVisitar = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href*="/imoveis/"]'))
      .map(a => a.href)
      .filter((link, index, self) => link.length > 30 && self.indexOf(link) === index);
  });

  console.log(`\n📋 ${linksParaVisitar.length} imóveis na fila.`);
  const dadosDetalhados = [];
  
  // 2. VISITAS
  for (let [index, link] of linksParaVisitar.entries()) {
    // Filtros de segurança
    if (link.endsWith('/sao-paulo') || link.includes('lojas') || link.includes('brasileiros-no-exterior')) continue;

    console.log(`\n➡️ (${index+1}/${linksParaVisitar.length}) Visitando: ${link}`);
    
    try {
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Rola a página para forçar carregamento das imagens (Lazy Load)
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 600;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= document.body.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
      await new Promise(r => setTimeout(r, 1500));

      // --- EXTRAÇÃO VIA CÓDIGO FONTE (Mais seguro para nuvem) ---
      const dadosPage = await page.evaluate((urlAtual) => {
        const dados = { url: urlAtual, diferenciais: [], fotos: [] };

        // 1. DADOS BÁSICOS DA URL
        const slug = urlAtual.split('/').pop();
        dados.id = 'MRV-' + slug.slice(-8);
        dados.titulo = slug.replace(/apartamentos-|casas-|lotes-/g, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        dados.tipo = slug.startsWith('casas') ? 'Casa' : 'Apartamento';
        dados.cidade = urlAtual.split('/')[5].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        dados.estado = 'SP';

        // Lê o HTML bruto para achar dados escondidos
        const html = document.body.innerHTML;
        const text = document.body.innerText;

        // 2. STATUS
        dados.status = 'Em Obras';
        if (html.includes('Pronto para morar')) dados.status = 'Pronto para Morar';
        else if (html.includes('Lançamento') || html.includes('Breve lançamento')) dados.status = 'Lançamento';

        // 3. ÁREA (M²) - Varredura no código
        dados.area = '0';
        const areasMatches = [...html.matchAll(/(\d{2,3}[.,]?\d{0,2})\s*m²/g)];
        for (const m of areasMatches) {
            let valStr = m[1].replace(',', '.');
            let val = parseFloat(valStr);
            // Filtra áreas improváveis (muito pequenas ou terrenos gigantes)
            if (val > 19 && val < 300) {
                dados.area = valStr;
                break; 
            }
        }

        // 4. BAIRRO E ENDEREÇO
        dados.bairro = 'A Consultar';
        dados.endereco = 'A Consultar';

        // Tenta achar tag de endereço no HTML
        const matchEnd = html.match(/Endereço:<\/p><p>(.*?)<\/p>/) || html.match(/Endereço:<\/span><span>(.*?)<\/span>/);
        if (matchEnd) {
            dados.endereco = matchEnd[1].replace(/<[^>]*>?/gm, ''); 
            // Tenta extrair bairro do parenteses
            const matchP = dados.endereco.match(/\((.*?)\)/);
            if (matchP) {
                let bruta = matchP[1]; 
                dados.bairro = bruta.split('-')[0].replace(/Região d[oa]/i, '').trim();
            }
        } 
        
        // Fallback: Procura "Região do..." no texto visível
        if (dados.bairro === 'A Consultar') {
            const matchRegiao = text.match(/Região d[oa] ([A-ZÀ-Ú][a-zà-ú]+(?:\s[A-ZÀ-Ú][a-zà-ú]+)*)/);
            if (matchRegiao) dados.bairro = matchRegiao[1].trim();
        }

        // 5. QUARTOS
        const matchQ = html.match(/(\d)\s*Quartos/i) || html.match(/(\d)\s*Dormitórios/i);
        dados.quartos = matchQ ? matchQ[1] : '2';

        // 6. FOTOS
        const imgs = Array.from(document.querySelectorAll('img'));
        let urlsFotos = imgs
            .map(img => img.src || img.getAttribute('data-src'))
            .filter(src => src && src.includes('cdn.mrv') && !src.includes('icon') && !src.includes('placeholder'));
        dados.fotos = [...new Set(urlsFotos)].slice(0, 10);
        
        // Foto de Capa (Segurança)
        if (dados.fotos.length === 0) {
            const capa = document.querySelector('img[alt*="Fachada"]');
            if (capa) dados.fotos.push(capa.src);
        }

        // 7. DESCRIÇÃO
        const descEl = document.querySelector('#resumo-descricao');
        dados.descricao = descEl ? descEl.innerText.replace(/\n+/g, ' ').trim() : "";

        // 8. DIFERENCIAIS
        const itensDif = Array.from(document.querySelectorAll('li span'));
        const possiveis = itensDif.map(el => el.innerText.trim()).filter(t => ['Churrasqueira', 'Pet Place', 'Piscina', 'Varanda'].some(k => t.includes(k)));
        dados.diferenciais = [...new Set(possiveis)];

        return dados;
      }, link);

      console.log(`   ✅ ${dadosPage.titulo} | 📍 ${dadosPage.bairro} | 📐 ${dadosPage.area}m²`);
      dadosDetalhados.push(dadosPage);

    } catch (erro) {
      console.log(`❌ Erro: ${erro.message}`);
    }
  }

  fs.writeFileSync('mrv_imoveis.json', JSON.stringify(dadosDetalhados, null, 2));
  console.log(`\n💾 SUCESSO! ${dadosDetalhados.length} imóveis salvos.`);
  await browser.close();
})();