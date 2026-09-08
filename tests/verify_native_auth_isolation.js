const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');

process.env.DISABLE_GOOGLE_AUTH = 'true';

async function run() {
  let passed = 0, total = 0;
  function assert(name, cond, extra = '') {
    total++;
    if (cond) { passed++; console.log(`✅ PASS: ${name} ${extra}`); }
    else console.error(`❌ FAIL: ${name} ${extra}`);
  }

  const runtime = new MaxAgentRuntime();
  const pid = 'test_pme_partner';
  const uid = '551199999999@s.whatsapp.net';

  // Cadastra catálogo PME para o parceiro de teste
  runtime.pme.updateAttendantConfig(pid, {
    catalog: [
      { name: 'Consultoria Especializada Max', priceLabel: 'R$ 150,00', durationMinutes: 60 }
    ]
  });

  // Track de dispatch
  const dispatchedTools = [];
  const originalDispatch = runtime._dispatch.bind(runtime);
  runtime._dispatch = async (name, args, partnerId) => {
    dispatchedTools.push({ name, args, partnerId });
    if (name === 'book_appointment_confirmed') {
      return { ok: true, message: 'Agendamento gravado com sucesso', appointment: { appointmentId: 'app_12345', durationMinutes: 60 } };
    }
    if (name === 'calendar_create') {
      return { ok: true, eventId: 'cal_event_999' };
    }
    return originalDispatch(name, args, partnerId);
  };

  console.log('--- TESTE 1: Draft completo com DISABLE_GOOGLE_AUTH=true ---');
  runtime._saveDraft(pid, uid, {
    clientName: 'Cliente Teste',
    serviceName: 'Consultoria Especializada Max',
    dateStr: '2026-08-29',
    timeSlot: '15:00'
  });
  dispatchedTools.length = 0;

  const res1 = await runtime.processTurn({
    mode: 'pme',
    partnerId: pid,
    userKey: uid,
    userMessage: 'Pode confirmar',
    googleAccessToken: 'TEST_TOKEN'
  });

  assert('Teste 1 - Intent é booking_confirmed', res1.intent === 'booking_confirmed', `got=${res1.intent}`);
  assert('Teste 1 - Contém AGENDAMENTO LOCAL nos fatos', res1.facts.some(f => f.includes('AGENDAMENTO LOCAL')), `facts=${JSON.stringify(res1.facts)}`);
  assert('Teste 1 - Contém CALENDAR_GOOGLE: isolado nos fatos', res1.facts.some(f => f.includes('CALENDAR_GOOGLE: isolado')), `facts=${JSON.stringify(res1.facts)}`);
  assert('Teste 1 - book_appointment_confirmed foi invocado', dispatchedTools.some(t => t.name === 'book_appointment_confirmed'));
  assert('Teste 1 - calendar_create NÃO foi invocado', !dispatchedTools.some(t => t.name === 'calendar_create'), `Disparado: ${dispatchedTools.map(t=>t.name)}`);

  console.log(`\n====================================================`);
  console.log(`📊 ${passed}/${total} testes de isolamento passaram com sucesso!`);
  console.log(`====================================================`);
  process.exit(passed === total ? 0 : 1);
}

run();
