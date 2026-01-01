const puppeteer = require('puppeteer');

(async () => {
  console.log('🚀 Iniciando Robô MRV - Versão Limpeza de Dados...');
  
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  await page.goto('https://www.mrv.com.br/imoveis/sao-paulo', { waitUntil: 'networkidle2' });

  // 1. Fecha cookies
  try {
    const btnCookies = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 4000 });
    if (btnCookies) await btnCookies.click();
  } catch (e) {}

  // 2. Carrega lista (Mesma lógica de antes)
  let cliques = 0;
  const MAX_CLIQUES = 20;
  
  console.log('🔄 Carregando todos os imóveis...');

  for (let i = 0; i < MAX_CLIQUES; i++) {
    try {
      const loadMoreButton = await page.waitForSelector('xpath///button[contains(., "Carregar mais imóveis")]', { timeout: 2000 });
      if (loadMoreButton) {
        await page.evaluate((el) => el.click(), loadMoreButton);
        cliques++;
        process.stdout.write(`\r👆 Carregando página ${cliques}...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    } catch (e) {
      console.log('\n✅ Lista carregada!');
      break;
    }
  }

  // 3. EXTRAÇÃO REFINADA (Usando o Link para pegar o Nome)
  console.log('✨ Higienizando dados...');

  const imoveis = await page.evaluate(() => {
    const listaDados = [];
    const cards = Array.from(document.querySelectorAll('a[href*="/imoveis/"]'));

    cards.forEach(card => {
      const link = card.href;
      const textoCompleto = card.innerText;

      // Filtro básico para ignorar links quebrados
      if (textoCompleto.length < 5) return;

      // --- TRUQUE DO NOME VIA LINK ---
      // Pega a última parte do link: "apartamentos-residencial-amaranto"
      const partesLink = link.split('/');
      let slug = partesLink[partesLink.length - 1]; 
      
      // Remove prefixos comuns da MRV e hífens
      let nomeLimpo = slug
        .replace('apartamentos-', '')
        .replace('casas-', '')
        .replace('lotes-', '')
        .replace(/-/g, ' '); // Troca traço por espaço

      // Deixa a primeira letra de cada palavra Maiúscula (Capitalize)
      nomeLimpo = nomeLimpo.replace(/\b\w/g, l => l.toUpperCase());

      // Tenta achar preço no texto (se tiver)
      const precoMatch = textoCompleto.match(/R\$\s*[\d.,]+/);
      const preco = precoMatch ? precoMatch[0] : 'Consulte';

      // Pega a cidade (geralmente é a penúltima parte do link)
      // ex: .../sao-paulo/aracatuba/apartamentos...
      let cidade = partesLink[partesLink.length - 2] || 'SP';
      cidade = cidade.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      listaDados.push({
        nome: nomeLimpo,
        cidade: cidade,
        preco_estimado: preco,
        link: link
      });
    });

    // Remove duplicatas baseado no link
    const unicos = listaDados.filter((item, index, self) =>
      index === self.findIndex((t) => (
        t.link === item.link
      ))
    );

    return unicos;
  });

  console.log(`\n📋 Lista Final: ${imoveis.length} empreendimentos processados.`);
  console.log('--- EXEMPLOS CORRIGIDOS ---');
  console.log(imoveis.slice(0, 5));
  
  // Salvar em arquivo JSON (opcional, para guardar o resultado)
  const fs = require('fs');
  fs.writeFileSync('mrv_imoveis.json', JSON.stringify(imoveis, null, 2));
  console.log('\n💾 Dados salvos no arquivo "mrv_imoveis.json"!');

  await browser.close();
})();