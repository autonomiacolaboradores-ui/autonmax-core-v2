const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');

async function run() {
  let passed = 0, total = 0;
  function assert(name, cond, extra = '') {
    total++;
    if (cond) { passed++; console.log(`✅ PASS: ${name} ${extra}`); }
    else console.error(`❌ FAIL: ${name} ${extra}`);
  }

  const runtime = new MaxAgentRuntime();

  console.log('--- 1. Testes extractDateTimeFromText (Fala Natural) ---');
  assert('17 horas -> 17:00', runtime.extractDateTimeFromText('amanhã 17 horas').timeSlot === '17:00', `got=${runtime.extractDateTimeFromText('amanhã 17 horas').timeSlot}`);
  assert('5 da tarde -> 17:00', runtime.extractDateTimeFromText('pode ser 5 da tarde').timeSlot === '17:00', `got=${runtime.extractDateTimeFromText('pode ser 5 da tarde').timeSlot}`);
  assert('nove da manhã -> 09:00', runtime.extractDateTimeFromText('nove da manhã amanhã').timeSlot === '09:00', `got=${runtime.extractDateTimeFromText('nove da manhã amanhã').timeSlot}`);
  assert('meio-dia -> 12:00', runtime.extractDateTimeFromText('meio-dia amanhã').timeSlot === '12:00', `got=${runtime.extractDateTimeFromText('meio-dia amanhã').timeSlot}`);
  assert('17h30 -> 17:30 (regressão)', runtime.extractDateTimeFromText('amanhã às 17h30').timeSlot === '17:30', `got=${runtime.extractDateTimeFromText('amanhã às 17h30').timeSlot}`);

  console.log('\n--- 2. Testes extractServiceName (Catálogo Real do PME) ---');
  // Cadastra catálogo do parceiro no configurador do PME
  runtime.pme.updateAttendantConfig('partner_demo_pme', {
    catalog: [
      { name: 'Instalação Personalizada Max', priceLabel: 'R$ 249,00', durationMinutes: 120 },
      { name: 'Plano Mensal Premium', priceLabel: 'R$ 498,00', durationMinutes: 240 }
    ]
  });

  const s1 = runtime.extractServiceName('gostaria de agendar a instalação personalizada max amanhã', 'partner_demo_pme');
  const s2 = runtime.extractServiceName('quero o plano mensal premium', 'partner_demo_pme');
  const s3 = runtime.extractServiceName('pode marcar instalacao max amanhã às 14h', 'partner_demo_pme');
  const s4 = runtime.extractServiceName('quero corte de cabelo', 'partner_demo_pme'); // Não existe no PME!

  assert('instalação personalizada max -> Instalação Personalizada Max', s1 === 'Instalação Personalizada Max', `got=${s1}`);
  assert('plano mensal premium -> Plano Mensal Premium', s2 === 'Plano Mensal Premium', `got=${s2}`);
  assert('instalacao max (fuzzy) -> Instalação Personalizada Max', s3 === 'Instalação Personalizada Max', `got=${s3}`);
  assert('serviço genérico não cadastrado (corte de cabelo) -> null', s4 === null, `got=${s4}`);

  console.log('\n--- 3. Testes extractClientName (Merge Sticky) ---');
  const n1 = runtime.extractClientName('Sara Regina, quero agendar');
  assert('nome inicial capturado (baixa confiança permitida sem draft prévio)', n1 === 'Sara Regina', 'got=' + n1);
  const n2 = runtime.extractClientName('See', { requireExplicitIntro: true });
  assert('ruído "See" IGNORADO quando já existe nome (requireExplicitIntro)', n2 === null, 'got=' + n2);
  const n3 = runtime.extractClientName('meu nome é Carla Souza', { requireExplicitIntro: true });
  assert('introdução explícita ainda funciona mesmo com requireExplicitIntro', n3 === 'Carla Souza', 'got=' + n3);

  console.log(`\n====================================================`);
  console.log(`📊 ${passed}/${total} testes passaram com sucesso!`);
  console.log(`====================================================`);
  process.exit(passed === total ? 0 : 1);
}

run();
