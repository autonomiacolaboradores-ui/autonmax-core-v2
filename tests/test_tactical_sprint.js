'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MultiProviderLlmRouter = require('../core/ring1/MultiProviderLlmRouter');
const WhatsAppDriver = require('../core/ring2/WhatsAppDriver');
const HttpServer = require('../core/ring2/HttpServer');

test('🚀 TACTICAL SUITE: Resilient LLM Cascade & WhatsApp Soft-Pause', async (mainTest) => {

  // ────────────────────────────────────────────────────────────────
  // BLOCO 1: Resiliência de LLMs e Cascata de Fallback
  // ────────────────────────────────────────────────────────────────

  await mainTest.test('1.1. LLM Router: Fallback gracioso silencioso sem provedores ativos', async () => {
    const router = new MultiProviderLlmRouter({
      grokApiKey: null,
      groqApiKey: null,
      openAiApiKey: null,
      geminiApiKey: null,
      openRouterApiKey: null
    });
    router.keys = { grok: null, groq: null, openai: null, gemini: null, openrouter: null };

    const result = await router.generateResponse({
      systemPrompt: 'Você é o Max.',
      userMessage: 'Olá Max, tudo bem?'
    });

    assert.ok(result, 'Resultado deve existir');
    assert.ok(result.text, 'Texto não pode ser vazio ou nulo');
    assert.ok(result.text.length > 10, 'Texto deve conter mensagem informativa');
    assert.strictEqual(result.providerUsed, 'LocalMaxEngine');
    assert.strictEqual(result.status, 'LOCAL_FALLBACK');
  });

  await mainTest.test('1.2. LLM Router: Simulação de falha no Grok com fallback silencioso para OpenAI', async () => {
    const router = new MultiProviderLlmRouter();
    router.keys.grok = 'invalid_grok_key';
    router.keys.openai = 'valid_openai_key';
    router.keys.gemini = null;
    router.keys.openrouter = null;

    // Mock do _callOpenAiCompatible para simular falha no Grok e sucesso na OpenAI
    router._callOpenAiCompatible = async ({ host, model }) => {
      if (host.includes('groq') || host.includes('x.ai')) {
        return { status: 'FAILED', reason: '429 Rate Limit Exceeded', shouldTripCircuitBreaker: true };
      }
      if (host.includes('openai.com')) {
        return { status: 'SUCCESS', text: 'Resposta simulada com sucesso da OpenAI!' };
      }
      return { status: 'FAILED', reason: 'HOST_UNKNOWN' };
    };

    const result = await router.generateResponse({
      userMessage: 'Teste de fallback Grok -> OpenAI'
    });

    assert.strictEqual(result.status, 'SUCCESS');
    assert.ok(result.providerUsed.includes('OpenAI'));
    assert.strictEqual(result.text, 'Resposta simulada com sucesso da OpenAI!');
  });

  await mainTest.test('1.3. LLM Router: Simulação de falha no Grok e OpenAI com fallback para Gemini', async () => {
    const router = new MultiProviderLlmRouter();
    router.keys.grok = 'invalid_grok';
    router.keys.openai = 'invalid_openai';
    router.keys.gemini = 'valid_gemini';

    router._callOpenAiCompatible = async () => {
      return { status: 'FAILED', reason: '503 Service Unavailable', shouldTripCircuitBreaker: true };
    };

    router._callGemini = async () => {
      return { status: 'SUCCESS', model: 'gemini-2.5-flash', text: 'Resposta simulada com sucesso do Gemini!' };
    };

    const result = await router.generateResponse({
      userMessage: 'Teste de fallback OpenAI -> Gemini'
    });

    assert.strictEqual(result.status, 'SUCCESS');
    assert.ok(result.providerUsed.includes('Gemini'));
    assert.strictEqual(result.text, 'Resposta simulada com sucesso do Gemini!');
  });

  // ────────────────────────────────────────────────────────────────
  // BLOCO 2: WhatsApp Driver (Soft-Pause)
  // ────────────────────────────────────────────────────────────────

  await mainTest.test('2.1. WhatsAppDriver: Soft-Pause por sessão e por número de telefone', () => {
    const driver = new WhatsAppDriver();
    const testJid = '5511999887766@s.whatsapp.net';
    const testPhone = '5511999887766';

    assert.strictEqual(driver.isSessionPaused(testJid), false, 'Inicialmente não deve estar pausado');

    // Pausar pelo número
    driver.pauseSession(testPhone);
    assert.strictEqual(driver.isSessionPaused(testJid), true, 'Deve reconhecer pausa pelo JID');
    assert.strictEqual(driver.isSessionPaused(testPhone), true, 'Deve reconhecer pausa pelo número puro');

    // Retomar pelo JID
    driver.resumeSession(testJid);
    assert.strictEqual(driver.isSessionPaused(testJid), false, 'Deve reconhecer retomada');
    assert.strictEqual(driver.isSessionPaused(testPhone), false);

    // Toggle
    const toggled = driver.toggleSessionPause(testPhone);
    assert.strictEqual(toggled, true, 'Toggle deve ativar pausa');
    assert.strictEqual(driver.isSessionPaused(testPhone), true);

    const toggledOff = driver.toggleSessionPause(testPhone);
    assert.strictEqual(toggledOff, false, 'Toggle deve desativar pausa');
    assert.strictEqual(driver.isSessionPaused(testPhone), false);
  });

  await mainTest.test('2.2. WhatsAppDriver: Soft-Pause Global', () => {
    const driver = new WhatsAppDriver();
    assert.strictEqual(driver.isSessionPaused('5511988887777@s.whatsapp.net'), false);

    driver.setGlobalPause(true);
    assert.strictEqual(driver.isSessionPaused('5511988887777@s.whatsapp.net'), true, 'Pausa global afeta qualquer sessão');
    assert.strictEqual(driver.isSessionPaused('5521999999999@s.whatsapp.net'), true);

    const status = driver.getSoftPauseStatus();
    assert.strictEqual(status.globalPaused, true);

    driver.setGlobalPause(false);
    assert.strictEqual(driver.isSessionPaused('5511988887777@s.whatsapp.net'), false);
  });

  await mainTest.test('2.3. WhatsAppDriver: Socket permanece online durante Soft-Pause', () => {
    const driver = new WhatsAppDriver();
    driver.connectionState = 'CONNECTED';

    driver.pauseSession('5511999887766');
    assert.strictEqual(driver.connectionState, 'CONNECTED', 'Socket Baileys não deve mudar para DISCONNECTED');

    driver.setGlobalPause(true);
    assert.strictEqual(driver.connectionState, 'CONNECTED', 'Socket Baileys permanece 100% ONLINE');

    const status = driver.getSoftPauseStatus('5511999887766');
    assert.strictEqual(status.socketStatus, 'CONNECTED');
    assert.strictEqual(status.socketOnline, true);
    assert.strictEqual(status.isPaused, true);
  });

  // ────────────────────────────────────────────────────────────────
  // BLOCO 3: HttpServer Endpoints de Soft-Pause
  // ────────────────────────────────────────────────────────────────

  await mainTest.test('3.1. HttpServer: Endpoint GET e POST /api/v1/whatsapp/soft-pause', async () => {
    const server = new HttpServer({ port: 0 });
    const serverInstance = await server.start();
    const port = serverInstance.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. GET inicial
    const getRes1 = await fetch(`${baseUrl}/api/v1/whatsapp/soft-pause?phone=5511987654321`);
    const getData1 = await getRes1.json();
    assert.strictEqual(getData1.status, 'SUCCESS');
    assert.strictEqual(getData1.isPaused, false);

    // 2. POST Pausar número
    const postRes1 = await fetch(`${baseUrl}/api/v1/whatsapp/soft-pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '5511987654321', action: 'pause' })
    });
    const postData1 = await postRes1.json();
    assert.strictEqual(postData1.status, 'SUCCESS');
    assert.strictEqual(postData1.isPaused, true);
    assert.ok(postData1.pausedSessions.includes('5511987654321'));

    // 3. GET após pausa
    const getRes2 = await fetch(`${baseUrl}/api/v1/whatsapp/soft-pause?phone=5511987654321`);
    const getData2 = await getRes2.json();
    assert.strictEqual(getData2.isPaused, true);

    // 4. POST Retomar número
    const postRes2 = await fetch(`${baseUrl}/api/v1/whatsapp/soft-pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '5511987654321', action: 'resume' })
    });
    const postData2 = await postRes2.json();
    assert.strictEqual(postData2.status, 'SUCCESS');
    assert.strictEqual(postData2.isPaused, false);

    // 5. GET final
    const getRes3 = await fetch(`${baseUrl}/api/v1/whatsapp/soft-pause?phone=5511987654321`);
    const getData3 = await getRes3.json();
    assert.strictEqual(getData3.isPaused, false);

    await server.stop();
  });

});
