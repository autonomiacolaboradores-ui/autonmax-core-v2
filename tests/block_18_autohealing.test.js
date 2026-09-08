const test = require('node:test');
const assert = require('node:assert/strict');
const { AutoHealingEngine, STATUS, SLA_MAX_LATENCY_MS, SLA_BURST_THRESHOLD } = require('../core/ring0/AutoHealingEngine');

test('🩹 BLOCK 18 — MAX.AutoHealing Engine & Resilience Telemetry', async (t) => {

  await t.test('1. Teste de SLA: Violação Contínua e Disparo do Circuit Breaker com Recuperação', async () => {
    const engine = new AutoHealingEngine();
    
    // Injeção de latência abaixo do SLA
    engine.logTelemetry({ subsystem: 'PAYMENT_GATEWAY', latencyMs: 50 });
    assert.strictEqual(engine.getStatus('PAYMENT_GATEWAY'), STATUS.HEALTHY);

    // Violação 1
    engine.logTelemetry({ subsystem: 'PAYMENT_GATEWAY', latencyMs: SLA_MAX_LATENCY_MS + 10 });
    // Violação 2
    engine.logTelemetry({ subsystem: 'PAYMENT_GATEWAY', latencyMs: SLA_MAX_LATENCY_MS + 10 });
    
    // Status ainda HEALTHY porque threshold não foi atingido
    assert.strictEqual(engine.getStatus('PAYMENT_GATEWAY'), STATUS.HEALTHY);

    // Violação 3 (Dispara Circuit Breaker e depois Soft-Fix automático)
    engine.logTelemetry({ subsystem: 'PAYMENT_GATEWAY', latencyMs: SLA_MAX_LATENCY_MS + 10 });
    
    // Após o SoftFix, o estado deve ser recuperado para HEALTHY
    assert.strictEqual(engine.getStatus('PAYMENT_GATEWAY'), STATUS.HEALTHY);
  });

  await t.test('2. Injeção de Segurança: Quarentena Imediata em Tentativa de Prototype Pollution', async () => {
    const engine = new AutoHealingEngine();

    engine.logTelemetry({ 
      subsystem: 'SANDBOX_VM', 
      type: 'SECURITY_VIOLATION',
      error: 'PROTOTYPE_POLLUTION_ATTEMPT'
    });

    assert.strictEqual(engine.getStatus('SANDBOX_VM'), STATUS.QUARANTINED);
  });

  await t.test('3. Falha Física e Rollback Atômico de Estado (WAL Snapshot)', async () => {
    const engine = new AutoHealingEngine();
    
    const mockLedger = {
      isRecovered: false,
      recoverDatabase() { this.isRecovered = true; }
    };

    engine.logTelemetry({ 
      subsystem: 'LEDGER_DB', 
      error: 'DATABASE_LOCKED_WAL_CORRUPT',
      ledger: mockLedger
    });

    // O sistema deve chamar ledger.recoverDatabase() e manter o status saudável
    assert.strictEqual(mockLedger.isRecovered, true);
    assert.strictEqual(engine.getStatus('LEDGER_DB'), STATUS.HEALTHY);
  });
});
