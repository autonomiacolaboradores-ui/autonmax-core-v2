const PmeOrderTools = require('./core/ring2/PmeOrderTools.js');

console.log('--- TESTANDO PARSER DE CATÁLOGO ---');
const rawCatalog = 'Camiseta Preta (R$ 80)'
Boné Azul (50 reais)
Calça Jeans - 120,50
Produto Genérico
Tênis: R$ 250.00;

const parsed = PmeOrderTools.parseProductsCatalog(rawCatalog);
console.log(JSON.stringify(parsed, null, 2));

console.log('\n--- TESTANDO RESOLUÇÃO FUZZY MATCH ---');
const tests = ['camiseta', 'bone', 'bone azul', 'tenis', 'calca'];
tests.forEach(t => {
    const res = PmeOrderTools.resolveProduct(parsed, t);
    console.log(Buscando por '': , res ? res.name : 'NÃO ENCONTRADO');
});

console.log('\n--- TESTANDO REGEX DO MAX AGENT ---');
const userMessage = 'olá, me vê 2 bonés azuis, uma camiseta preta e 3x calça jeans por favor. Ah, e um produto generico também.';
const regex = /(?:(\\d+|um|uma|dois|duas|três|tres|quatro|cinco)\\s*(?:x|unidades? de|de)?\\s*)([a-zA-ZÀ-ÿ0-9\\s]+?)(?:(?:\\s+e\\s+)|,|\\.|\\n|$)/gi;
const wordToNum = { 'um':1, 'uma':1, 'dois':2, 'duas':2, 'três':3, 'tres':3, 'quatro':4, 'cinco':5 };

let match;
let newItems = [];
while ((match = regex.exec(userMessage)) !== null) {
    const qtyRaw = match[1].toLowerCase();
    const quantity = parseInt(qtyRaw) || wordToNum[qtyRaw] || 1;
    const prod = match[2].trim();
    if (prod.length > 2 && !/^(reais|vezes|dias|minutos|horas|meses|produto)$/i.test(prod)) {
        newItems.push({ quantity, productName: prod });
    }
}
console.log('Itens Extraídos da Frase:');
console.log(JSON.stringify(newItems, null, 2));

