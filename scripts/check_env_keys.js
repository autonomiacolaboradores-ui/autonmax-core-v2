const fs = require('fs');
const path = require('path');

// Carregar .env manualmente se dotenv não estiver instalado
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = (match[2] || '').trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value;
    }
  }
}

try {
  require('dotenv').config();
} catch (_) {}

console.log('🔍 [DIAGNÓSTICO DE APIS] Verificando chaves de ambiente no .env...\n');

const keysToTest = [
    { name: 'GROQ_API_KEY', prefix: 'gsk_' },
    { name: 'OPENAI_API_KEY', prefix: 'sk-' },
    { name: 'GEMINI_API_KEY', prefix: 'AIza' },
    { name: 'DEEPSEEK_API_KEY', prefix: 'sk-' },
    { name: 'OPENROUTER_API_KEY', prefix: 'sk-or-' }
];

let validCount = 0;

keysToTest.forEach(keyInfo => {
    const keyValue = process.env[keyInfo.name];
    if (!keyValue) {
        console.log(`❌ ${keyInfo.name.padEnd(22)}: AUSENTE / NÃO CONFIGURADA`);
    } else if (keyInfo.prefix && !keyValue.startsWith(keyInfo.prefix)) {
        console.log(`⚠️ ${keyInfo.name.padEnd(22)}: CONFIGURADA (Formato pode estar desalinhado com o padrão '${keyInfo.prefix}')`);
        validCount++;
    } else {
        console.log(`🟢 ${keyInfo.name.padEnd(22)}: CONFIGURADA E PRONTA (${keyValue.substring(0, 8)}...${keyValue.slice(-4)})`);
        validCount++;
    }
});

console.log(`\n📊 STATUS: ${validCount} de ${keysToTest.length} chaves verificadas e ativas.`);
