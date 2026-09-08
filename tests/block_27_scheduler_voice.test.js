const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const SchedulerEngine = require('../core/ring1/SchedulerEngine');
const { RuntimeCore } = require('../core/ring0/RuntimeCore');

test('🚀 BLOCK 27 — Scheduler Engine, Reminders & Ambient Voice (RFC 013)', async (mainTest) => {

  await mainTest.test('1. Agendamento, Persistência SQLite e Listagem de Lembretes', async () => {
    const dbPath = path.join(__dirname, '..', 'workspace', 'autonmax_test_27.db');
    if (fs.existsSync(dbPath)) { try { fs.unlinkSync(dbPath); } catch (_) {} }

    const core = new RuntimeCore({ dbPath });
    core.boot();

    const scheduler = new SchedulerEngine(core, null, null);

    const alertAt = new Date(Date.now() + 5000).toISOString();
    const reminder = scheduler.addReminder({
      userId: 'user_01',
      text: 'Reunião de Alinhamento PIX',
      alertAt,
      targetChannel: 'UI'
    });

    assert.ok(reminder.id > 0);
    assert.strictEqual(reminder.status, 'PENDING');

    const pending = scheduler.listPendingReminders('user_01');
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].text, 'Reunião de Alinhamento PIX');

    scheduler.clearAllTimers();
    core.close();
    if (fs.existsSync(dbPath)) { try { fs.unlinkSync(dbPath); } catch (_) {} }
  });

  await mainTest.test('2. Disparo de Alarmes e Multi-Channel Alert (SurfaceBridge & WhatsApp)', async () => {
    let surfaceEventDispatched = false;
    let waMessageDispatched = false;

    const mockSurfaceBridge = {
      emit: (event, payload) => {
        if (event === 'REMINDER_ALERT') surfaceEventDispatched = true;
      }
    };

    const mockWhatsappBridge = {
      onIncomingMessage: (msg, id) => {
        if (msg.includes('[ALERTA-AGENDA]')) waMessageDispatched = true;
      }
    };

    const scheduler = new SchedulerEngine(null, mockSurfaceBridge, mockWhatsappBridge);

    const reminder = scheduler.addReminder({
      userId: 'user_02',
      text: 'Pagar Fornecedor',
      alertAt: new Date().toISOString(),
      targetChannel: 'WHATSAPP'
    });

    // Forçar disparo imediato
    scheduler.triggerAlert(reminder);

    assert.strictEqual(reminder.status, 'TRIGGERED');
    assert.strictEqual(surfaceEventDispatched, true, 'Deveria emitir alerta no SurfaceBridge');
    assert.strictEqual(waMessageDispatched, true, 'Deveria enviar mensagem automática no WhatsAppBridge');

    scheduler.clearAllTimers();
  });

});
