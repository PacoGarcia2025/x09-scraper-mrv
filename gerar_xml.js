const fs = require('fs');

try {
    const rawData = fs.readFileSync('mrv_imoveis.json');
    const imoveis = JSON.parse(rawData);

    const clean = (txt) => {
        if (!txt) return '';
        return txt.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
    };

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<listings>\n';

    imoveis.forEach(imovel => {
        if (!imovel.url) return;

        xml += '  <listing>\n';
        xml += `    <id>${clean(imovel.id)}</id>\n`;
        xml += `    <titulo>${clean(imovel.titulo)}</titulo>\n`;
        xml += `    <tipo>${clean(imovel.tipo)}</tipo>\n`;
        xml += `    <preco>0</preco>\n`;
        
        xml += `    <cidade>${clean(imovel.cidade)}</cidade>\n`;
        xml += `    <estado>${clean(imovel.estado)}</estado>\n`;
        xml += `    <bairro>${clean(imovel.bairro)}</bairro>\n`;
        xml += `    <endereco>${clean(imovel.endereco)}</endereco>\n`;
        
        xml += `    <status>${clean(imovel.status)}</status>\n`;
        xml += `    <url>${clean(imovel.url)}</url>\n`;
        
        // Descrição Inteligente
        let desc = imovel.descricao;
        if (!desc || desc.length < 10) {
            desc = `Lançamento ${imovel.titulo} em ${imovel.cidade}. Apartamentos de ${imovel.area}m² com ${imovel.quartos} dormitórios.`;
            if (imovel.bairro !== 'A Consultar') desc += ` Localizado no bairro ${imovel.bairro}.`;
        }
        if (imovel.diferenciais && imovel.diferenciais.length > 0) {
            desc += ` Diferenciais: ${imovel.diferenciais.join(', ')}.`;
        }
        xml += `    <descricao>${clean(desc)}</descricao>\n`;
        
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
    console.log('✅ XML Final Gerado!');

} catch (e) {
    console.log('❌ Erro: ' + e.message);
}