'use strict';

/**
 * Certificação interna adversária — Max Atendente
 * Agenda, painel, locks, datas, pause, prompts, concorrência, persistência.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const WORKSPACE = path.join(ROOT, 'workspace');
const REPORT_PATH = path.join(WORKSPACE, 'reports', 'certification_adversarial_report.json');
const TEST_DB = path.join(WORKSPACE, 'attendants_db_cert_test.json');

const results = [];
let passed = 0;
let failed = 0;

function record(suite, name, ok, detail = '', extra = {}) {
  const row = { suite, name, ok, detail, ...extra, ts: new Date().toISOString() };
  results.push(row);
  if (ok) {
    passed += 1;
    console.log(`  ✅ [${suite}] ${name}`);
  } else {
    failed += 1;
    console.log(`  ❌ [${suite}] ${name} — ${detail}`);
  }
}

function cleanTestArtifacts() {
  for (const p of [
    TEST_DB,
    `${TEST_DB}.tmp`,
    path.join(WORKSPACE, 'attendants_mirror', 'cert_partner.json'),
    path.join(WORKSPACE, 'attendants_mirror', 'cert_partner_race.json')
  ]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (_) {}
  }
  const lockDir = path.join(WORKSPACE, 'slot_locks');
  if (fs.existsSync(lockDir)) {
    for (const f of fs.readdirSync(lockDir)) {
      if (f.includes('cert_')) {
        try {
          fs.unlinkSync(path.join(lockDir, f));
        } catch (_) {}
      }
    }
  }
}

async function run() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' CERTIFICAÇÃO ADVERSÁRIA — MAX ATENDENTE');
  console.log('══════════════════════════════════════════════════\n');
  cleanTestArtifacts();

  const { PmeAgentConfigurator } = require('../core/ring1/PmeAgentConfigurator');
  const PmeBookingTools = require('../core/ring2/PmeBookingTools');
  const BookingDateTime = require('../core/ring2/BookingDateTime');
  const AudioHandler = require('../core/ring2/AudioHandler');
  const { runProductReadiness } = require('../core/ring0/ProductReadiness');
  const SystemPrompt = require('../core/ring1/SystemPrompt');
  const { OwnerAlert } = require('../core/ring2/OwnerAlert');
  const { getWorkspaceHygiene } = require('../core/ring0/WorkspaceHygiene');

  // ─── 1. DATAS NATURAIS ───────────────────────────────────────────
  console.log('\n[1] BookingDateTime — linguagem natural');
  const today = BookingDateTime.nowSP();
  record('datetime', 'nowSP retorna dateStr', /^\d{4}-\d{2}-\d{2}$/.test(today.dateStr), today.dateStr);

  const cases = [
    { phrase: 'amanhã às 9', expectDayOffset: 1, expectHour: 9 },
    { phrase: 'amanhã de manhã às 9', expectDayOffset: 1, expectHour: 9 },
    { phrase: 'hoje às 14h', expectDayOffset: 0, expectHour: 14 },
    { phrase: 'terça às 15:30', expectHour: 15 }
  ];
  for (const c of cases) {
    try {
      const parsed = BookingDateTime.extractDateTime(c.phrase);
      const dateStr = parsed && parsed.dateStr;
      const timeSlot = parsed && parsed.timeSlot;
      const hourOk =
        !c.expectHour ||
        (timeSlot && Number(String(timeSlot).split(':')[0]) === c.expectHour);
      const dayOk =
        c.expectDayOffset == null ||
        dateStr === BookingDateTime.addDays(today.dateStr, c.expectDayOffset);
      record(
        'datetime',
        `parse "${c.phrase}"`,
        !!(dateStr && timeSlot && hourOk && dayOk),
        `date=${dateStr} slot=${timeSlot}`
      );
    } catch (e) {
      record('datetime', `parse "${c.phrase}"`, false, e.message);
    }
  }

  record(
    'datetime',
    'formatFriendly legível PT',
    /feira|de |às/i.test(BookingDateTime.formatFriendly(today.dateStr, '09:00')),
    BookingDateTime.formatFriendly(today.dateStr, '09:00')
  );

  // ─── 2. PAINEL / CONFIG ──────────────────────────────────────────
  console.log('\n[2] Painel PME — normalização e persistência');
  const cfg = new PmeAgentConfigurator(TEST_DB);
  PmeBookingTools.setConfigurator(cfg);
  const pid = 'cert_partner';

  cfg.updateAttendantConfig(pid, {
    catalog: [
      { name: 'Corte Masculino', price: '45,00', duration: 30 },
      { name: 'Barba', priceCents: 2500, durationMinutes: 20 },
      { name: '', price: 10 }, // inválido
      { name: 'Combo', price: 'R$ 80', durationMin: 50 }
    ],
    workingHours: {
      days: ['seg', 'ter', 'qua', 'qui', 'sex'],
      start: '09:00',
      end: '18:00'
    },
    storeName: 'Barbearia Cert',
    ownerPhone: '5511999990000'
  });

  let conf = cfg.getAttendantConfig(pid);
  record('panel', 'catálogo normaliza ids/tags/preço', conf.catalog.length === 3, `n=${conf.catalog.length}`);
  record(
    'panel',
    'item tem tag e durationMinutes',
    conf.catalog.every((c) => c.tag && c.durationMinutes >= 15),
    JSON.stringify(conf.catalog.map((c) => c.tag))
  );
  record(
    'panel',
    'workingHours dias em português',
    conf.workingHours.days.includes('Segunda') && conf.workingHours.startTime === '09:00',
    JSON.stringify(conf.workingHours)
  );
  record('panel', 'ownerPhone/Jid salvo', !!(conf.ownerJid || conf.ownerPhone), conf.ownerJid || conf.ownerPhone);
  record('panel', 'flush grava no disco', fs.existsSync(TEST_DB), TEST_DB);

  const cfgReload = new PmeAgentConfigurator(TEST_DB);
  const conf2 = cfgReload.getAttendantConfig(pid);
  record(
    'panel',
    'reload pós-restart mantém catálogo',
    (conf2.catalog || []).length === 3,
    `n=${(conf2.catalog || []).length}`
  );

  // ─── 3. AGENDA FELIZ + ADVERSÁRIA ────────────────────────────────
  console.log('\n[3] Agenda — fluxos felizes e adversários');
  PmeBookingTools.setConfigurator(cfgReload);
  const tomorrow = BookingDateTime.addDays(today.dateStr, 1);

  const book1 = await PmeBookingTools.createAppointment({
    partnerId: pid,
    clientName: 'Ana Silva',
    serviceName: 'Corte Masculino',
    dateStr: tomorrow,
    timeSlot: '10:00'
  });
  record('booking', 'cria agendamento válido', !!(book1 && book1.ok), book1 && (book1.reason || book1.message));

  const bookDup = await PmeBookingTools.createAppointment({
    partnerId: pid,
    clientName: 'Bruno',
    serviceName: 'Corte Masculino',
    dateStr: tomorrow,
    timeSlot: '10:00'
  });
  record(
    'booking',
    'bloqueia double-book mesmo horário',
    !!(bookDup && bookDup.ok === false),
    bookDup && (bookDup.reason || bookDup.message)
  );

  const bookGhost = await PmeBookingTools.createAppointment({
    partnerId: pid,
    clientName: 'Carla',
    serviceName: 'Serviço Que Não Existe XYZ',
    dateStr: tomorrow,
    timeSlot: '11:00'
  });
  record(
    'booking',
    'hard-fail serviço fora do catálogo',
    !!(bookGhost && bookGhost.ok === false),
    bookGhost && (bookGhost.reason || bookGhost.message)
  );

  const bookOutside = await PmeBookingTools.createAppointment({
    partnerId: pid,
    clientName: 'Diego',
    serviceName: 'Barba',
    dateStr: tomorrow,
    timeSlot: '23:00'
  });
  record(
    'booking',
    'rejeita fora do expediente',
    !!(bookOutside && bookOutside.ok === false),
    bookOutside && (bookOutside.reason || bookOutside.message)
  );

  const bookOk2 = await PmeBookingTools.createAppointment({
    partnerId: pid,
    clientName: 'Elena Costa',
    serviceName: 'Barba',
    dateStr: tomorrow,
    timeSlot: '11:00'
  });
  record('booking', 'segundo horário livre OK', !!(bookOk2 && bookOk2.ok), bookOk2 && bookOk2.message);

  // Persistência após “crash” (novo processo de configurator)
  const cfg3 = new PmeAgentConfigurator(TEST_DB);
  const conf3 = cfg3.getAttendantConfig(pid);
  const apptCount = (conf3.existingAppointments || []).filter((a) => a.status !== 'CANCELLED').length;
  record('booking', 'agendamentos sobrevivem reload', apptCount >= 2, `count=${apptCount}`);

  const slots = PmeBookingTools.getAvailableSlots({
    partnerId: pid,
    dateStr: tomorrow,
    serviceName: 'Corte Masculino'
  });
  record(
    'booking',
    'getAvailableSlots não inclui 10:00 ocupado',
    Array.isArray(slots.slots) && !slots.slots.includes('10:00'),
    `slots sample=${(slots.slots || []).slice(0, 5).join(',')}`
  );

  // Cancel
  PmeBookingTools.setConfigurator(cfg3);
  if (book1.appointment && book1.appointment.appointmentId) {
    const cancel = await PmeBookingTools.cancelAppointment({
      partnerId: pid,
      appointmentId: book1.appointment.appointmentId
    });
    record('booking', 'cancelamento funciona', !!(cancel && cancel.ok), cancel && cancel.message);
  } else {
    record('booking', 'cancelamento funciona', false, 'sem appointmentId do book1');
  }

  // ─── 4. CONCORRÊNCIA EXTREMA ─────────────────────────────────────
  console.log('\n[4] Concorrência extrema no mesmo slot');
  const racePid = 'cert_partner_race';
  const raceCfg = new PmeAgentConfigurator(TEST_DB);
  raceCfg.updateAttendantConfig(racePid, {
    catalog: [{ name: 'Consulta', price: '100', durationMinutes: 30 }],
    workingHours: { days: ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'], startTime: '08:00', endTime: '20:00' }
  });
  PmeBookingTools.setConfigurator(raceCfg);
  const raceDay = BookingDateTime.addDays(today.dateStr, 2);
  const raceSlot = '15:00';

  const N = 20;
  const promises = Array.from({ length: N }, (_, i) =>
    PmeBookingTools.createAppointment({
      partnerId: racePid,
      clientName: `RaceClient_${i}`,
      serviceName: 'Consulta',
      dateStr: raceDay,
      timeSlot: raceSlot
    })
  );
  const raceResults = await Promise.all(promises);
  const wins = raceResults.filter((r) => r && r.ok).length;
  const losses = raceResults.filter((r) => r && !r.ok).length;
  record(
    'concurrency',
    `20 paralelos no mesmo slot → exatamente 1 sucesso`,
    wins === 1,
    `wins=${wins} losses=${losses}`
  );

  const raceReload = new PmeAgentConfigurator(TEST_DB);
  const raceAppts = (raceReload.getAttendantConfig(racePid).existingAppointments || []).filter(
    (a) => a.dateStr === raceDay && a.timeSlot === raceSlot && a.status !== 'CANCELLED'
  );
  record(
    'concurrency',
    'após race, disco tem 1 appointment no slot',
    raceAppts.length === 1,
    `disk=${raceAppts.length}`
  );

  // ─── 5. PROMPTS ANTI-ALUCINAÇÃO ──────────────────────────────────
  console.log('\n[5] Prompts — proibições de produto');
  const promptText = String(
    SystemPrompt.PARTNER_UNIVERSAL_EMPLOYEE_PROMPT || SystemPrompt.getSystemPrompt() || ''
  );
  record(
    'prompt',
    'proíbe equipe técnica / confirmação humana',
    /equipe técnica|confirmação humana|equipe humana/i.test(promptText),
    'trecho presente no system prompt'
  );

  let factsBlock = '';
  try {
    const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');
    const rt = new MaxAgentRuntime({});
    factsBlock = rt.formatFactsBlock({
      facts: ['FALTAM DADOS DO CLIENTE (não é espera de equipe): data'],
      intent: 'booking_pending'
    });
  } catch (e) {
    factsBlock = e.message;
  }
  record(
    'prompt',
    'facts block proíbe equipe e upsell inventado',
    /NUNCA diga que aguarda equipe|equipe técnica|upsell/i.test(factsBlock),
    factsBlock.slice(0, 120)
  );

  // ─── 6. ÁUDIO FALLBACK ───────────────────────────────────────────
  console.log('\n[6] Áudio STT fallback');
  const fb = AudioHandler.getFallbackMessage();
  record(
    'audio',
    'fallback pede texto digitado',
    /digitar|texto/i.test(fb) && /desculpe|não consegui/i.test(fb),
    fb.slice(0, 80)
  );

  // ─── 7. SOFT-PAUSE ───────────────────────────────────────────────
  console.log('\n[7] Soft-pause + contexto');
  const WhatsAppDriver = require('../core/ring2/WhatsAppDriver');
  const drv = new WhatsAppDriver({
    authDir: path.join(WORKSPACE, 'sessions', 'baileys_auth_cert_test')
  });
  drv.setGlobalPause(true);
  record('pause', 'global pause ativa', drv.isSessionPaused('5511888777666') === true, 'paused');
  drv.bufferPausedMessage('5511888777666@s.whatsapp.net', 'quero remarcar para sexta');
  drv.bufferPausedMessage('5511888777666@s.whatsapp.net', 'meu nome é João');
  const fact = drv.formatPausedContextFact('5511888777666');
  record(
    'pause',
    'contexto da pausa preservado',
    !!(fact && /remarcar|João|sexta/i.test(fact)),
    (fact || '').slice(0, 100)
  );
  drv.setGlobalPause(false);
  record('pause', 'resume limpa bloqueio', drv.isSessionPaused('5511888777666') === false, 'active');

  // ─── 8. HIGIENE + READINESS + OWNER ALERT ─────────────────────────
  console.log('\n[8] Higiene, readiness, owner alert');
  const hyg = getWorkspaceHygiene({ maxAgeDays: 14 });
  const hygResult = hyg.runOnce();
  record('ops', 'WorkspaceHygiene runOnce', typeof hygResult.removed === 'number', JSON.stringify(hygResult));

  const readiness = runProductReadiness();
  record(
    'ops',
    'ProductReadiness executa',
    typeof readiness.score === 'number',
    `score=${readiness.score} critical=${(readiness.criticalFail || []).join(',')}`
  );

  const alert = new OwnerAlert({});
  const alertRes = await alert.notify('wa_disconnected', 'cert test');
  record(
    'ops',
    'OwnerAlert não quebra sem JID',
    alertRes && (alertRes.reason === 'NO_OWNER_JID' || alertRes.reason === 'COOLDOWN' || alertRes.ok === true),
    JSON.stringify(alertRes)
  );

  // ─── 9. SUPERFÍCIES HTTP (smoke sem server bind se possível) ─────
  console.log('\n[9] Superfícies de código (exports)');
  const surfaces = [
    ['PmeBookingTools', PmeBookingTools],
    ['BookingDateTime', BookingDateTime],
    ['AudioHandler', AudioHandler],
    ['PmeAgentConfigurator', PmeAgentConfigurator],
    ['SystemPrompt', SystemPrompt]
  ];
  for (const [name, mod] of surfaces) {
    record('surface', `${name} exportável`, !!mod, typeof mod);
  }

  // ─── 10. INVARIANTS DE REGISTRO ──────────────────────────────────
  console.log('\n[10] Qualidade do registro de agenda');
  const finalCfg = new PmeAgentConfigurator(TEST_DB);
  const finalConf = finalCfg.getAttendantConfig(pid);
  const sample = (finalConf.existingAppointments || []).find((a) => a.clientName === 'Elena Costa');
  if (sample) {
    record(
      'quality',
      'registro tem serviceName + dateFriendly + serviceTag',
      !!(sample.serviceName && sample.dateFriendly && sample.serviceTag),
      JSON.stringify({
        serviceName: sample.serviceName,
        dateFriendly: sample.dateFriendly,
        tag: sample.serviceTag
      })
    );
    record(
      'quality',
      'registro sem campos vazios críticos',
      !!(sample.clientName && sample.dateStr && sample.timeSlot && sample.status === 'CONFIRMED'),
      sample.status
    );
  } else {
    record('quality', 'registro Elena encontrado', false, 'missing');
  }

  // Mirror
  const mirrorPath = path.join(WORKSPACE, 'attendants_mirror', 'cert_partner.json');
  record('quality', 'mirror por parceiro existe', fs.existsSync(mirrorPath), mirrorPath);

  // ─── REPORT ──────────────────────────────────────────────────────
  const report = {
    product: 'Max Atendente (Autonmax)',
    certification: 'INTERNAL_ADVERSARIAL_v1',
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed,
      passRate: results.length ? Math.round((passed / results.length) * 1000) / 10 : 0
    },
    results,
    environment: {
      node: process.version,
      cwd: process.cwd()
    }
  };

  const reportDir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log('\n══════════════════════════════════════════════════');
  console.log(` RESULTADO: ${passed}/${results.length} OK (${report.summary.passRate}%) — falhas: ${failed}`);
  console.log(` Relatório: ${REPORT_PATH}`);
  console.log('══════════════════════════════════════════════════\n');

  return report;
}

run()
  .then((r) => {
    process.exit(r.summary.failed > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error('HARNESS CRASH', e);
    process.exit(2);
  });
