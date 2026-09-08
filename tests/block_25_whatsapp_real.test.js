const test = require('node:test');
const assert = require('node:assert/strict');
const WhatsAppBridge = require('../core/ring1/WhatsAppBridge');

test('🚀 BLOCK 25 — Real WhatsApp Integration & Secretary MAX (RFC 011)', async (mainTest) => {

  await mainTest.test('1. Inicialização de Sessão e Geração de QR Code Base64 (Fallback Baileys)', async () => {
    const bridge = new WhatsAppBridge(null);
    assert.strictEqual(bridge.getPhoneStatus(), 'DISCONNECTED');
    
    const session = bridge.initSession();
    assert.strictEqual(bridge.getPhoneStatus(), 'WAITING_SCAN');
    assert.strictEqual(session.status, 'WAITING_SCAN');
    assert.ok(session.qrDataUrl.startsWith('data:image/png;base64,'), 'QR Code deve ser uma Data-URL válida');
  });

  await mainTest.test('2. Ativação e Resposta Autônoma do Modo Secretário MAX', async () => {
    const bridge = new WhatsAppBridge(null);
    bridge.connect();
    
    // Activating secretary mode
    const modeState = bridge.setSecretaryMode(true, 'Estou em reunião de planejamento.', 'Eduardo');
    assert.strictEqual(modeState.secretaryMode, true);
    assert.strictEqual(modeState.userName, 'Eduardo');

    const reply = bridge.onIncomingMessage('Preciso falar com você urgente!', '5511999999999');
    assert.ok(reply.aiResponse.includes('Sou o MAX'), 'A resposta não contém a assinatura do Secretário MAX');
    assert.ok(reply.aiResponse.includes('Eduardo'), 'A resposta não contém o nome customizado do proprietário');
    assert.ok(reply.aiResponse.includes('Estou em reunião de planejamento.'), 'A resposta não contém o custom message de ocupado');
  });

  await mainTest.test('3. Desconexão e Limpeza de Estado', async () => {
    const bridge = new WhatsAppBridge(null);
    bridge.connect();
    assert.strictEqual(bridge.getPhoneStatus(), 'CONNECTED');
    
    bridge.disconnect();
    assert.strictEqual(bridge.getPhoneStatus(), 'DISCONNECTED');
    
    assert.throws(() => bridge.onIncomingMessage('Alguém aí?', '5511999999999'), /WA_BRIDGE_FAULT/);
  });

});
