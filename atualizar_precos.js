const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🚀 Iniciando Robô de Detalhes (Versão com Rolagem)...');

  try {
    const rawData = fs.readFileSync('mrv_imoveis.json');
    var listaImoveis = JSON.parse(rawData);
  } catch (e) {
    console.log('❌ Erro: Arquivo mrv_imoveis.json não encontrado.');
    return;
  }

  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'] 
  });
  const page = await browser.newPage();

  // Testando com os 3 primeiros imóveis reais (pulando o link falso se houver)
  const listaParaProcessar = listaImoveis.filter(i => i.nome !== 'Sao Paulo').slice(0, 3); 

  console.log(`🕵️‍♂️ Visitando ${listaParaProcessar.length} imóveis...`);

  for (let i = 0; i < listaParaProcessar.length; i++) {
    const imovel = listaParaProcessar[i];
    console.log(`\n➡️ (${i+1}) Acessando: ${imovel.nome}`);
    
    try {
      await page.goto(imovel.link, { waitUntil: 'networkidle2', timeout: 60000 });

      // --- TRUQUE NOVO: ROLAGEM AUTOMÁTICA ---
      console.log('   ⬇️ Rolando a página para carregar tudo...');
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            // Rola até o fim ou até 3000 pixels (suficiente para ver preços)
            if (totalHeight >= 3000 || totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
      // Espera um pouco após rolar
      await new Promise(r => setTimeout(r, 2000));

      // TIRA FOTO PARA PROVA
      await page.screenshot({ path: `imovel_${i+1}.png`, fullPage: false });
      console.log(`   📸 Foto salva: imovel_${i+1}.png`);

      // Tenta achar preço novamente
      const dados = await page.evaluate(() => {
        const corpo = document.body.innerText;
        // Regex mais agressivo: procura R$ seguido de qualquer número
        const match = corpo.match(/R\$\s*[\d.,]+/);
        return match ? match[0] : null;
      });

      if (dados) {
        console.log(`   💰 PREÇO ENCONTRADO: ${dados}`);
      } else {
        console.log('   ⚠️ Ainda sem preço explícito.');
      }

    } catch (erro) {
      console.log(`❌ Erro: ${erro.message}`);
    }
  }

  await browser.close();
  console.log('\n🏁 Teste finalizado. Confira as imagens "imovel_X.png" na pasta.');
})();