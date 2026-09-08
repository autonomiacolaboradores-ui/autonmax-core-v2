const test = require('node:test');
const assert = require('node:assert/strict');
const WhatsAppBridge = require('../core/ring1/WhatsAppBridge');
const { RuntimeCore } = require('../core/ring0/RuntimeCore');
const path = require('node:path');
const fs = require('node:fs');

test('🚀 BLOCK 24 — First-Impression Omnichannel & Voice Bundle (RFC 010)', async (mainTest) => {

  await mainTest.test('1. WhatsAppBridge: Sincronização de QR e Bridge Bi-direcional', async () => {
    const bridge = new WhatsAppBridge(null);
    assert.strictEqual(bridge.status, 'DISCONNECTED');
    
    const session = bridge.initSession();
    assert.strictEqual(bridge.status, 'WAITING_SCAN');
    assert.ok(session.qrDataUrl.includes('data:image/png;base64,'));

    // Reject message if not connected
    assert.throws(() => bridge.onIncomingMessage('Teste', '5511999999999'), /WA_BRIDGE_FAULT/);

    bridge.connect();
    assert.strictEqual(bridge.status, 'CONNECTED');
    
    const reply = bridge.onIncomingMessage('Teste', '5511999999999');
    assert.ok(reply.aiResponse.includes('[AUTONOMIA-WA-REPLY]'));
  });

  await mainTest.test('2. RuntimeCore: Seed de Estado Zero para Carteira Dual', async () => {
    const dbPath = path.join(__dirname, '..', 'workspace', 'autonmax_test_24.db');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

    const core = new RuntimeCore({ dbPath });
    core.boot();

    assert.strictEqual(core.getStateKey('BRL_BALANCE'), '0.00');
    assert.strictEqual(core.getStateKey('MAXCOIN_BALANCE'), '0.00');

    core.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

});
