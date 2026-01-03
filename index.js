const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  console.log('🚀 Iniciando Robô MRV - Versão FINAL (Filtro de Imagens Agressivo)...');
  
  // CONFIGURAÇÃO PARA NUVEM (HEADLESS NEW)
  const browser = await puppeteer.launch({ 
    headless: "new",
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });
  
  const page = await browser.newPage();
  
  // 1. LISTAGEM
  console.log('📑 Acessando listagem...');
  // Aumentei o timeout para 90s para garantir em dias lentos
  await page.goto('https://www.mrv.com.br/imoveis/sao-paulo', { waitUntil: 'networkidle2', timeout: 90000 });
  
  try {
    const btn = await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
    if (btn) await btn.click();
  } catch (e) {}

  // Carrega mais imóveis
  console.log('👇 Carregando mais imóveis...');
  for (let i = 0; i < 15; i++) {
    try {
      // Tenta clicar no botão de carregar
      const btn = await page.waitForSelector('button.btn-carregar-mais', { timeout: 2000 }) || 
                  await page.$x("//button[contains(., 'Carregar')]");
                  
      if (btn) {
         if (btn.click) await btn.click();
         else await btn[0].click();
         await new Promise(r => setTimeout(r, 1500));
      }
    } catch (e) { break; }
  }

  const linksParaVisitar = await page.evaluate(() => {
    // Seletor mais específico para os cards de imóveis
    return Array.from(document.querySelectorAll('a[href*="/imoveis/"]'))
      .map(a => a.href)
      .filter((link, index, self) => link.length > 35 && self.indexOf(link) === index && !link.includes('google'));
  });

  console.log(`\n📋 ${linksParaVisitar.length} imóveis na fila.`);
  const dadosDetalhados = [];
  
  // 2. VISITAS
  for (let [index, link] of linksParaVisitar.entries()) {
    // Filtros de segurança
    if (link.endsWith('/sao-paulo') || link.includes('lojas') || link.includes('brasileiros-no-exterior') || link.includes('poltica-de-privacidade')) continue;

    console.log(`\n➡️ (${index+1}/${linksParaVisitar.length}) Visitando: ${link}`);
    
    try {
      await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Rola a página para forçar carregamento das imagens (Lazy Load)
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 700; // Rola mais rápido
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
      await new Promise(r => setTimeout(r, 2000)); // Espera um pouco mais as imagens

      // --- EXTRAÇÃO ---
      const dadosPage = await page.evaluate((urlAtual) => {
        const dados = { url: urlAtual, diferenciais: [], fotos: [] };

        // 1. BASE
        const slug = urlAtual.split('/').pop();
        dados.id = 'MRV-' + slug.slice(-8);
        dados.titulo = slug.replace(/apartamentos-|casas-|lotes-/g, '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        
        dados.tipo = 'Apartamento';
        if (slug.startsWith('casas')) dados.tipo = 'Casa';
        if (slug.startsWith('lotes')) dados.tipo = 'Lote';

        const parts = urlAtual.split('/');
        dados.cidade = parts[5] ? parts[5].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'SP';
        dados.estado = 'SP';

        const html = document.body.innerHTML;
        const text = document.body.innerText;

        // 2. QUARTOS
        dados.quartos = (dados.tipo === 'Lote') ? '0' : '2';
        if (dados.tipo !== 'Lote') {
            const matchQ = html.match(/(\d)\s*Quartos/i) || html.match(/(\d)\s*Dormitórios/i);
            if (matchQ) dados.quartos = matchQ[1];
        }

        // 3. STATUS
        dados.status = 'Em Obras';
        if (html.includes('Pronto para morar')) dados.status = 'Pronto para Morar';
        else if (html.includes('Lançamento') || html.includes('Breve lançamento')) dados.status = 'Lançamento';

        // 4. ÁREA
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

        // 5. BAIRRO/ENDEREÇO
        dados.bairro = 'A Consultar';
        dados.endereco = 'A Consultar';
        // Tenta pegar endereço completo da tag oculta
        const matchEnd = html.match(/Endereço:<\/p><p>(.*?)<\/p>/) || html.match(/Endereço:<\/span><span>(.*?)<\/span>/);
        if (matchEnd) {
            dados.endereco = matchEnd[1].replace(/<[^>]*>?/gm, '').trim();
            const matchP = dados.endereco.match(/\((.*?)\)/);
            if (matchP) {
                dados.bairro = matchP[1].split('-')[0].replace(/Região d[oa]/i, '').trim();
            }
        } 
        if (dados.bairro === 'A Consultar' || dados.bairro.length < 3) {
             const matchRegiao = text.match(/Região d[oa] ([A-ZÀ-Ú][a-zà-ú]+(?:\s[A-ZÀ-Ú][a-zà-ú]+)*)/);
             if (matchRegiao) dados.bairro = matchRegiao[1].trim();
        }

        // ==================================================================
        // 6. FOTOS (FILTRO AGRESSIVO DE LIXO) 🗑️😡
        // ==================================================================
        const imgs = Array.from(document.querySelectorAll('img'));
        let urlsFotos = imgs
            .map(img => img.src || img.getAttribute('data-src'))
            .filter(src => {
                // 1. Tem que ser um link válido e vir do CDN da MRV
                if (!src || !src.startsWith('http') || !src.includes('cdn.mrv')) return false;

                const lower = src.toLowerCase();

                // 2. LISTA NEGRA AGRESSIVA: Se tiver qualquer uma dessas palavras, TCHAU.
                const lixo = [
                    // Ícones e UI básicos
                    'icon', 'logo', 'placeholder', 'avatar', 'thumb', 'svg', 'selo', 'banner',
                    // Redes Sociais e Contato
                    'whatsapp', 'facebook', 'instagram', 'youtube', 'linkedin', 'twitter', 'email', 'chat',
                    // Mapas e Localização
                    'mapa', 'pin', 'marker', 'localizacao', 'waze', 'uber',
                    // Elementos de interface
                    'seta', 'arrow', 'next', 'prev', 'close', 'fechar', 'menu', 'hamburguer',
                    'bg-', 'background', 'fundo', 'rodape', 'footer', 'header',
                    // Pessoas/Depoimentos (que não são o imóvel)
                    'user', 'cliente', 'depoimento', 'corretor', 'pessoa',
                    // Outros lixos comuns
                    'fav', 'star', 'check', 'play', 'video', 'gif', 'transparente'
                ];

                // Se a URL contiver qualquer palavra da lista negra, retorna FALSE (filtra)
                if (lixo.some(palavraProibida => lower.includes(palavraProibida))) return false;

                // Se passou por tudo, provavelmente é uma foto boa
                return true;
            });
        
        // Remove duplicatas e pega as 15 primeiras (aumentei um pouco)
        dados.fotos = [...new Set(urlsFotos)].slice(0, 15);
        
        // Fallback da capa se não sobrou nada
        if (dados.fotos.length === 0) {
            // Tenta achar imagens grandes que não sejam banners
            const render = document.querySelector('img[src*="render"]');
            if (render) dados.fotos.push(render.src);
        }
        // ==================================================================


        // 7. DIFERENCIAIS (Busca por palavras-chave no texto)
        const keywords = [
            'Churrasqueira', 'Pet Place', 'Piscina', 'Varanda', 'Playground', 
            'Salão de Festas', 'Espaço Gourmet', 'Academia', 'Fitness',
            'Bicicletário', 'Pomar', 'Horta', 'Coworking', 'Brinquedoteca'
        ];
        dados.diferenciais = keywords.filter(key => text.includes(key));

        // 8. DESCRIÇÃO
        const descEl = document.querySelector('#resumo-descricao');
        dados.descricao = descEl ? descEl.innerText.replace(/\n+/g, ' ').trim() : "";

        return dados;
      }, link);

      console.log(`   ✅ ${dadosPage.titulo.substring(0,20)}.. (${dadosPage.tipo}) | 📸 ${dadosPage.fotos.length} fotos limpas`);
      dadosDetalhados.push(dadosPage);

    } catch (erro) {
      console.log(`❌ Erro: ${erro.message}`);
    }
  }

  fs.writeFileSync('mrv_imoveis.json', JSON.stringify(dadosDetalhados, null, 2));
  console.log(`\n💾 SUCESSO! ${dadosDetalhados.length} imóveis salvos.`);
  await browser.close();
})();