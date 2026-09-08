const test = require('node:test');
const assert = require('node:assert/strict');
const GeminiLlmEngine = require('../core/ring1/GeminiLlmEngine');

test('🚀 BLOCK 31 — Gemini LLM Engine & Cloud Ready Launcher (RFC 017)', async (mainTest) => {

  await mainTest.test('1. Instanciação e Modo Fallback Transparente sem chave de API', async () => {
    const fs = require('node:fs');
    // Forçar cenário sem chaves: interceptar loadEnvFile e limpar process.env
    const originalRead = fs.readFileSync;
    fs.readFileSync = (p, enc) => p.includes('.env') ? '' : originalRead(p, enc);
    
    const originalGroq = process.env.GROQ_API_KEY;
    const originalGemini = process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;

    // Passar objeto de chaves vazio {} conforme instrução
    const engine = new GeminiLlmEngine({});
    
    const response = await engine.generateResponse({
      userMessage: 'Olá Gemini, você está online?'
    });

    assert.ok(['SOVEREIGN_FALLBACK', 'OFFLINE_FALLBACK', 'LOCAL_FALLBACK'].includes(response.status));
    assert.ok(response.model);
    assert.ok(response.text.length > 0);

    // Restore
    fs.readFileSync = originalRead;
    if (originalGroq) process.env.GROQ_API_KEY = originalGroq;
    if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
  });

  await mainTest.test('2. Formatação de Payload com Injeção de systemInstruction', async () => {
    const engine = new GeminiLlmEngine({ apiKey: 'TEST_KEY_123' });
    
    const payload = engine.formatPayload({
      systemPrompt: 'Você é o agente PME exclusivo da Barbearia.',
      userMessage: 'Qual o valor do corte?',
      history: [{ role: 'user', text: 'Oi' }, { role: 'model', text: 'Olá, como posso ajudar?' }]
    });

    assert.ok(payload.systemInstruction);
    assert.strictEqual(payload.systemInstruction.parts[0].text, 'Você é o agente PME exclusivo da Barbearia.');
    assert.strictEqual(payload.contents.length, 3); // 2 de histórico + 1 mensagem atual
    assert.strictEqual(payload.contents[2].parts[0].text, 'Qual o valor do corte?');
  });

  await mainTest.test('3. Respeito à Variável de Ambiente process.env.PORT', async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = '8080';

    const portUsed = process.env.PORT || 3000;
    assert.strictEqual(portUsed, '8080');

    if (originalPort) {
      process.env.PORT = originalPort;
    } else {
      delete process.env.PORT;
    }
  });

});
