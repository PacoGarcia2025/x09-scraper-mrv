const fs = require('fs');

try {
    const rawData = fs.readFileSync('mrv_imoveis.json');
    const imoveis = JSON.parse(rawData);

    // Função de limpeza
    const clean = (txt) => {
        if (!txt) return '';
        return txt.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
    };

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<listings>\n';

    imoveis.forEach(imovel => {
        // Ignora links inválidos
        if (imovel.titulo === 'Sao Paulo' || !imovel.url) return;

        xml += '  <listing>\n';
        xml += `    <id>${clean(imovel.id)}</id>\n`;
        xml += `    <titulo>${clean(imovel.titulo)}</titulo>\n`;
        xml += `    <tipo>Apartamento</tipo>\n`;
        xml += `    <preco>0</preco>\n`; // Preço 0 = Sob Consulta
        
        xml += `    <cidade>${clean(imovel.cidade)}</cidade>\n`;
        xml += `    <estado>SP</estado>\n`;
        xml += `    <bairro>${clean(imovel.bairro)}</bairro>\n`;
        
        xml += `    <status>${clean(imovel.status)}</status>\n`;
        xml += `    <url>${clean(imovel.url)}</url>\n`;
        
        // Descrição automática
        const desc = `Oportunidade MRV: ${imovel.titulo}. Localizado em ${imovel.cidade}, bairro ${imovel.bairro}. Apartamentos com ${imovel.quartos} dormitórios. Status: ${imovel.status}.`;
        xml += `    <descricao>${clean(desc)}</descricao>\n`;
        
        // Lista de FOTOS
        xml += `    <fotos>\n`;
        xml += `      <foto>${clean(imovel.imagem)}</foto>\n`;
        xml += `    </fotos>\n`;
        
        // Lista de TIPOLOGIAS
        xml += `    <tipologias>\n`;
        xml += `      <tipologia>\n`;
        xml += `        <dormitorios>${clean(imovel.quartos)}</dormitorios>\n`;
        xml += `        <area>0</area>\n`;
        xml += `      </tipologia>\n`;
        xml += `    </tipologias>\n`;

        xml += '  </listing>\n';
    });

    xml += '</listings>';

    fs.writeFileSync('feed_mrv.xml', xml);
    console.log('✅ Arquivo "feed_mrv.xml" gerado no padrão X09!');

} catch (erro) {
    console.log('❌ Erro: ' + erro.message);
}