const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🚀 Iniciando Robô MRV - Padrão X09 (Capturando Fotos e Tipologia)...');
  
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  const url = 'https://www.mrv.com.br/imoveis/sao-paulo';
  
  console.log(`🔗 Acessando: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle2' });

  // Aceita cookies
  try {
    const btnCookies = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 4000 });
    if (btnCookies) await btnCookies.click();
  } catch (e) {}

  // Carrega lista (Limite de segurança)
  let cliques = 0;
  const MAX_CLIQUES = 20;
  
  for (let i = 0; i < MAX_CLIQUES; i++) {
    try {
      const loadMoreButton = await page.waitForSelector('xpath///button[contains(., "Carregar mais imóveis")]', { timeout: 2500 });
      if (loadMoreButton) {
        await page.evaluate((el) => el.click(), loadMoreButton);
        cliques++;
        process.stdout.write(`\r👆 Carregando página ${cliques}...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e) {
      break;
    }
  }

  // EXTRAÇÃO DOS DADOS
  console.log('\n📸 Extraindo dados estruturados...');

  const imoveis = await page.evaluate(() => {
    const listaDados = [];
    const cards = Array.from(document.querySelectorAll('a[href*="/imoveis/"]'));

    cards.forEach((card, index) => {
      const link = card.href;
      const textoCompleto = card.innerText;
      
      if (textoCompleto.length < 5) return;

      // ID ÚNICO
      const partesLink = link.split('/');
      const slug = partesLink[partesLink.length - 1];
      const id = 'MRV-' + slug.slice(-6) + index;

      // NOME
      let nomeLimpo = slug
        .replace(/apartamentos-|casas-|lotes-/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());

      // CIDADE
      let cidade = partesLink[partesLink.length - 2] || 'São Paulo';
      cidade = cidade.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      // IMAGEM (Tenta pegar a imagem do card)
      let imagem = 'https://www.mrv.com.br/content/dam/mrv/placeholders/placeholder-imovel.jpg';
      const imgTag = card.querySelector('img');
      if (imgTag) {
        imagem = imgTag.getAttribute('src') || imgTag.getAttribute('data-src') || imagem;
      }

      // STATUS
      const textoLower = textoCompleto.toLowerCase();
      let status = 'Em Obras';
      if (textoLower.includes('lançamento') || textoLower.includes('breve')) status = 'Lançamento';
      if (textoLower.includes('pronto')) status = 'Pronto para Morar';

      // QUARTOS (Tipologia)
      let quartos = '2';
      const matchQuartos = textoCompleto.match(/(\d)\s*dormitórios?/);
      if (matchQuartos) quartos = matchQuartos[1];

      // BAIRRO (Tenta extrair do texto "Região do...")
      let bairro = 'A Consultar';
      const matchBairro = textoCompleto.match(/Região d[oa] (.*?)(?=\n|$)/);
      if (matchBairro) bairro = matchBairro[1].trim();

      listaDados.push({
        id: id,
        titulo: nomeLimpo,
        cidade: cidade,
        bairro: bairro,
        status: status,
        url: link,
        imagem: imagem,
        quartos: quartos
      });
    });

    // Remove duplicatas
    return listaDados.filter((item, index, self) =>
      index === self.findIndex((t) => (t.url === item.url))
    );
  });

  fs.writeFileSync('mrv_imoveis.json', JSON.stringify(imoveis, null, 2));
  console.log(`\n💾 Dados atualizados! ${imoveis.length} imóveis salvos em "mrv_imoveis.json".`);
  
  await browser.close();
})();