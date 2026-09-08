const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');
process.env.DISABLE_GOOGLE_AUTH = 'false';

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

  console.log('--- TESTE 1: Draft com dateStr+timeSlot, serviceName="", clientName=""; userMessage="Pode" ---');
  runtime._saveDraft(pid, uid, {
    clientName: '',
    serviceName: '',
    dateStr: '2026-08-29',
    timeSlot: '15:00'
  });
  dispatchedTools.length = 0;

  const res1 = await runtime.processTurn({
    mode: 'pme',
    partnerId: pid,
    userKey: uid,
    userMessage: 'Pode',
    googleAccessToken: 'TEST_TOKEN'
  });

  assert('Teste 1 - Intent é booking_confirmed', res1.intent === 'booking_confirmed', `got=${res1.intent}`);
  assert('Teste 1 - Contém AGENDAMENTO CONFIRMADO ✅ nos fatos', res1.facts.some(f => f.includes('AGENDAMENTO CONFIRMADO ✅')), `facts=${JSON.stringify(res1.facts)}`);
  assert('Teste 1 - book_appointment_confirmed foi invocado', dispatchedTools.some(t => t.name === 'book_appointment_confirmed'), `tools=${dispatchedTools.map(t=>t.name).join(',')}`);
  assert('Teste 1 - calendar_create foi invocado', dispatchedTools.some(t => t.name === 'calendar_create'), `tools=${dispatchedTools.map(t=>t.name).join(',')}`);
  assert('Teste 1 - Serviço usado foi o do catálogo', dispatchedTools.find(t => t.name === 'book_appointment_confirmed')?.args.serviceName === 'Consultoria Especializada Max');
  assert('Teste 1 - Nome usado foi fallback Cliente', dispatchedTools.find(t => t.name === 'book_appointment_confirmed')?.args.clientName === 'Cliente');

  console.log('\n--- TESTE 2: Draft só com dateStr, sem timeSlot; userMessage="Sim" ---');
  runtime._saveDraft(pid, uid, {
    clientName: 'Carlos',
    serviceName: 'Consultoria Especializada Max',
    dateStr: '2026-08-29',
    timeSlot: ''
  });
  dispatchedTools.length = 0;

  const res2 = await runtime.processTurn({
    mode: 'pme',
    partnerId: pid,
    userKey: uid,
    userMessage: 'Sim'
  });

  assert('Teste 2 - Intent é booking_pending', res2.intent === 'booking_pending', `got=${res2.intent}`);
  assert('Teste 2 - Fato pede horário', res2.facts.some(f => f.includes('faltam horário')), `facts=${JSON.stringify(res2.facts)}`);
  assert('Teste 2 - book_appointment_confirmed NÃO foi invocado', !dispatchedTools.some(t => t.name === 'book_appointment_confirmed'));

  console.log('\n--- TESTE 3: Sem draft / sem data; userMessage="Pode" ---');
  runtime._clearDraft(pid, uid);
  dispatchedTools.length = 0;

  const res3 = await runtime.processTurn({
    mode: 'pme',
    partnerId: pid,
    userKey: uid,
    userMessage: 'Pode'
  });

  assert('Teste 3 - Não inventa data e não faz commit', !dispatchedTools.some(t => t.name === 'book_appointment_confirmed'));
  assert('Teste 3 - Não retorna AGENDAMENTO CONFIRMADO', !res3.facts.some(f => f.includes('AGENDAMENTO CONFIRMADO ✅')));

  console.log('\n--- TESTE 4: pushName="Maria", sem nome no texto; confirmação com data+hora ---');
  runtime._saveDraft(pid, uid, {
    clientName: '',
    serviceName: '',
    dateStr: '2026-08-29',
    timeSlot: '16:00'
  });
  dispatchedTools.length = 0;

  const res4 = await runtime.processTurn({
    mode: 'pme',
    partnerId: pid,
    userKey: uid,
    userMessage: 'Pode confirmar',
    pushName: 'Maria Silva',
    googleAccessToken: 'TEST_TOKEN'
  });

  assert('Teste 4 - Commit efetuado com sucesso', res4.intent === 'booking_confirmed', `got=${res4.intent}`);
  assert('Teste 4 - Nome do cliente usou pushName Maria Silva', dispatchedTools.find(t => t.name === 'book_appointment_confirmed')?.args.clientName === 'Maria Silva');

  console.log('\n--- TESTE 5: Cliente informa serviço e nome explicitamente ---');
  runtime._saveDraft(pid, uid, {
    clientName: '',
    serviceName: '',
    dateStr: '2026-08-29',
    timeSlot: '10:00'
  });
  dispatchedTools.length = 0;

  const res5 = await runtime.processTurn({
    mode: 'pme',
    partnerId: pid,
    userKey: uid,
    userMessage: 'Meu nome é Roberto, pode confirmar a Consultoria Especializada Max',
    pushName: 'OutroNome',
    googleAccessToken: 'TEST_TOKEN'
  });

  assert('Teste 5 - Preferiu nome explícito Roberto', dispatchedTools.find(t => t.name === 'book_appointment_confirmed')?.args.clientName === 'Roberto');
  assert('Teste 5 - Preferiu serviço explícito do texto', dispatchedTools.find(t => t.name === 'book_appointment_confirmed')?.args.serviceName === 'Consultoria Especializada Max');

  console.log('\n--- TESTE 6: Regressão - Mensagem sem intenção de booking ---');
  runtime._clearDraft(pid, uid);
  dispatchedTools.length = 0;

  const res6 = await runtime.processTurn({
    mode: 'pme',
    partnerId: pid,
    userKey: uid,
    userMessage: 'Qual o horário de funcionamento de vocês?'
  });

  assert('Teste 6 - Não dispara book_appointment_confirmed', !dispatchedTools.some(t => t.name === 'book_appointment_confirmed'));
  assert('Teste 6 - Intent não é booking_confirmed', res6.intent !== 'booking_confirmed');

  console.log(`\n====================================================`);
  console.log(`📊 ${passed}/${total} testes cirúrgicos passaram com sucesso!`);
  console.log(`====================================================`);
  process.exit(passed === total ? 0 : 1);
}

run();
