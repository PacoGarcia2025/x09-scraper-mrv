const fs = require('fs');

try {
    const rawData = fs.readFileSync('mrv_imoveis.json');
    const imoveis = JSON.parse(rawData);

    // FUNÇÃO DE LIMPEZA NUCLEAR
    // Remove emojis, quebras de linha ruins e caracteres invisíveis que travam importadores
    const clean = (txt) => {
        if (!txt) return '';
        return txt.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/[\u0800-\uFFFF]/g, '') // Remove emojis e caracteres complexos
            .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ') // Remove caracteres de controle estranhos
            .trim();
    };

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<listings>\n';

    imoveis.forEach((imovel, index) => {
        if (!imovel.url) return;

        // Garante ID único mesmo se o slug for parecido
        const uniqueID = clean(imovel.id) + '-' + index;

        xml += '  <listing>\n';
        xml += `    <id>${uniqueID}</id>\n`;
        xml += `    <titulo>${clean(imovel.titulo)}</titulo>\n`;
        xml += `    <tipo>${clean(imovel.tipo)}</tipo>\n`;
        xml += `    <preco>0</preco>\n`;
        
        xml += `    <cidade>${clean(imovel.cidade)}</cidade>\n`;
        xml += `    <estado>SP</estado>\n`;
        
        let bairroLimpo = clean(imovel.bairro);
        if (bairroLimpo.length > 50 || bairroLimpo.includes('Apartamentos')) bairroLimpo = 'A Consultar';
        xml += `    <bairro>${bairroLimpo}</bairro>\n`;
        
        xml += `    <endereco>${clean(imovel.endereco)}</endereco>\n`;
        xml += `    <status>${clean(imovel.status)}</status>\n`;
        xml += `    <url>${clean(imovel.url)}</url>\n`;
        
        // Descrição Segura
        let desc = clean(imovel.descricao);
        if (desc.length < 5) desc = `Confira este lançamento: ${imovel.titulo}.`;
        xml += `    <descricao>${desc}</descricao>\n`;
        
        // Features
        if (imovel.diferenciais && imovel.diferenciais.length > 0) {
            xml += `    <features>${clean(imovel.diferenciais.join(','))}</features>\n`;
        }

        // Fotos
        xml += `    <fotos>\n`;
        if (imovel.fotos && imovel.fotos.length > 0) {
            imovel.fotos.forEach(f => xml += `      <foto>${clean(f)}</foto>\n`);
        } else {
            xml += `      <foto>https://www.mrv.com.br/content/dam/mrv/placeholders/placeholder-imovel.jpg</foto>\n`;
        }
        xml += `    </fotos>\n`;
        
        // Tipologia
        xml += `    <tipologias>\n`;
        xml += `      <tipologia>\n`;
        xml += `        <dormitorios>${clean(imovel.quartos)}</dormitorios>\n`;
        xml += `        <area>${clean(imovel.area)}</area>\n`;
        xml += `      </tipologia>\n`;
        xml += `    </tipologias>\n`;

        xml += '  </listing>\n';
    });

    xml += '</listings>';

    fs.writeFileSync('feed_mrv.xml', xml);
    console.log('✅ XML Seguro Gerado!');

} catch (e) {
    console.log('❌ Erro: ' + e.message);
}