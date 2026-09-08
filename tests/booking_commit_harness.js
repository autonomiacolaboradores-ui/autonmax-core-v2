'use strict';

// tests/booking_commit_harness.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');
const { PmeAgentConfigurator } = require('../core/ring1/PmeAgentConfigurator');
const PmeBookingTools = require('../core/ring2/PmeBookingTools');

async function run() {
  console.log('[HARNESS] Iniciando teste de regressão E2E Booking R1.8...');
  
  // 1. Setup
  const pme = new PmeAgentConfigurator();
  // Forçar db path mock
  pme.dbPath = path.join(__dirname, '../workspace/attendants_db_test.json');
  if (fs.existsSync(pme.dbPath)) fs.unlinkSync(pme.dbPath);
  pme.attendants = {};
  
  // Criar config
  const pid = 'test_partner_1';
  pme.createDefaultConfig(pid);
  const cfg = pme.getAttendantConfig(pid);
  cfg.catalog = [
    { id: 'srv_1', name: 'Corte de Cabelo', priceCents: 5000, durationMinutes: 30 }
  ];
  pme.updateAttendantConfig(pid, cfg);
  
  const runtime = new MaxAgentRuntime({ pmeConfigurator: pme });
  PmeBookingTools.setConfigurator(pme);

  const uid = '5511999999999@s.whatsapp.net';

  // 2. Turno 1: Cliente pede para agendar (gera draft parcial)
  console.log('[HARNESS] Turno 1: Intent de agendamento');
  let res = await runtime.processTurn({ mode: 'pme', partnerId: pid, userKey: uid, userMessage: 'Quero agendar um corte de cabelo amanhã às 14h, meu nome é Teste.' });
  
  const draft = runtime._readDraft(pid, uid);
  assert.ok(draft, 'Draft deveria existir');
  assert.equal(draft.clientName, 'Teste', 'Nome deve ser extraído');
  assert.ok(draft.dateStr, 'Data deve ser preenchida');
  assert.equal(draft.timeSlot, '14:00', 'Hora deve ser extraída');
  assert.ok(res.intent.includes('booking'), 'Intent deve conter booking');

  // 3. Turno 2: Confirmação do cliente ("Sim")
  console.log('[HARNESS] Turno 2: Confirmação (Sim)');
  res = await runtime.processTurn({ mode: 'pme', partnerId: pid, userKey: uid, userMessage: 'Sim' });
  
  assert.ok(res.facts.some(f => f.includes('AGENDAMENTO CONFIRMADO')), 'Fact deve ter confirmação');
  assert.equal(runtime._readDraft(pid, uid), null, 'Draft deve ser limpo');

  // 4. Validação no Configurator (Persistência em memória e disco)
  const savedCfg = pme.getAttendantConfig(pid);
  assert.ok(savedCfg.existingAppointments && savedCfg.existingAppointments.length === 1, 'Deve ter 1 agendamento');
  const app = savedCfg.existingAppointments[0];
  assert.equal(app.clientName, 'Teste');
  assert.equal(app.serviceName, 'Corte de Cabelo');

  // 5. Teste de Anti-perda (Simular restart + reload do disco com dados a mais)
  console.log('[HARNESS] Teste de Merge Anti-perda...');
  const diskData = JSON.parse(fs.readFileSync(pme.dbPath, 'utf8'));
  diskData[pid].existingAppointments.push({
    appointmentId: 'fake_123',
    clientName: 'Fantasma',
    serviceName: 'Barba',
    dateStr: '2026-01-01',
    timeSlot: '10:00'
  });
  fs.writeFileSync(pme.dbPath, JSON.stringify(diskData));

  // Acionar um save que vai causar o merge
  pme.saveData();

  const mergedCfg = pme.getAttendantConfig(pid);
  assert.equal(mergedCfg.existingAppointments.length, 2, 'Merge deveria manter os 2 agendamentos');
  
  console.log('[HARNESS] ✅ Todos os testes passaram!');
  if (fs.existsSync(pme.dbPath)) fs.unlinkSync(pme.dbPath);
}

run().catch(err => {
  console.error('[HARNESS] ❌ Erro:', err);
  process.exit(1);
});
