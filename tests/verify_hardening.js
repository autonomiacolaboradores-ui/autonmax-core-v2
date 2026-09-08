const GoogleCalendarConnector = require('../core/ring2/GoogleCalendarConnector');
const { PartnerAuthManager } = require('../core/ring1/PartnerAuthManager');
const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');
const { runWithContext, getContext } = require('../core/ring1/requestContext');

async function runRigorousTestSuite() {
  console.log('====================================================');
  console.log('🧪 BATERIA COMPLETA DE TESTES DE CONFORMIDADE REAL');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(name, condition, extra = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ PASS [${total}]: ${name} ${extra ? '-> ' + extra : ''}`);
    } else {
      console.error(`❌ FAIL [${total}]: ${name} ${extra ? '-> ' + extra : ''}`);
    }
  }

  // ----------------------------------------------------
  // TESTE 1: fetchWithTimeout (~8s abort, não trava)
  // ----------------------------------------------------
  console.log('\n--- 1. Teste fetchWithTimeout ---');
  const t0 = Date.now();
  const origFetch = global.fetch;
  global.fetch = (url, options) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 15000);
      if (options && options.signal) {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
  };

  const slowRes = await GoogleCalendarConnector.dispatch('calendar_list', 'fake_token', {});
  const elapsed = Date.now() - t0;
  assert('fetchWithTimeout aborta em ~8s com reason TIMEOUT', slowRes.reason === 'TIMEOUT' && elapsed >= 7500 && elapsed <= 9500, `elapsed=${elapsed}ms, reason=${slowRes.reason}`);

  // ----------------------------------------------------
  // TESTE 2: invalid_grant limpa tokens e 2ª chamada não tenta de novo
  // ----------------------------------------------------
  console.log('\n--- 2. Teste invalid_grant Limpeza & 2ª Mensagem ---');
  let dbRow = { id: 'usr_invalid', google_access_token: 'old_tok', google_refresh_token: 'bad_ref', google_token_expires_at: 1000 };
  let googleFetchCount = 0;

  const mockDb = {
    dbGet: async (sql, params) => {
      if (dbRow && dbRow.id === params[0]) return dbRow;
      return null;
    },
    dbRun: async (sql, params) => {
      if (sql.includes('SET google_access_token = NULL')) {
        dbRow = { id: params[0], google_access_token: null, google_refresh_token: null, google_token_expires_at: null };
      }
    }
  };

  const authManager = new PartnerAuthManager(mockDb);
  process.env.GOOGLE_CLIENT_ID = 'test_client_id';
  process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';

  global.fetch = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      googleFetchCount++;
      return {
        status: 400,
        ok: false,
        json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
      };
    }
    return { status: 200, ok: true };
  };

  // 1ª chamada: detecta invalid_grant e limpa banco
  const res1 = await authManager.ensureValidGoogleAccessToken('usr_invalid', true);
  assert('1ª chamada retorna null em invalid_grant', res1 === null);
  assert('Tokens foram limpos no SQLite para NULL', dbRow.google_refresh_token === null && dbRow.google_access_token === null);

  // 2ª chamada (próximo turno): não deve nem chamar o Google
  const res2 = await authManager.ensureValidGoogleAccessToken('usr_invalid', false);
  assert('2ª chamada retorna null sem chamar Google novamente', res2 === null && googleFetchCount === 1, `googleFetchCount=${googleFetchCount}`);

  // ----------------------------------------------------
  // TESTE 3: Mutex per-user (apenas 1 chamada para o Google)
  // ----------------------------------------------------
  console.log('\n--- 3. Teste Mutex Concorrente per-user ---');
  let mutexDbRow = { id: 'usr_mutex', google_access_token: 'exp_tok', google_refresh_token: 'good_ref', google_token_expires_at: 1000 };
  let refreshCalls = 0;

  const mutexDb = {
    dbGet: async () => mutexDbRow,
    dbRun: async (sql, params) => {
      mutexDbRow.google_access_token = params[0];
      mutexDbRow.google_refresh_token = params[1];
      mutexDbRow.google_token_expires_at = params[2];
    }
  };

  const mutexAuth = new PartnerAuthManager(mutexDb);
  global.fetch = async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      refreshCalls++;
      await new Promise((r) => setTimeout(r, 100)); // simula latência de rede
      return {
        status: 200,
        ok: true,
        json: async () => ({ access_token: 'new_fresh_token_123', expires_in: 3600, refresh_token: 'good_ref' })
      };
    }
    return { status: 200, ok: true };
  };

  const [m1, m2] = await Promise.all([
    mutexAuth.ensureValidGoogleAccessToken('usr_mutex', true),
    mutexAuth.ensureValidGoogleAccessToken('usr_mutex', true)
  ]);

  assert('Mutex retornou mesmo token para as duas chamadas concorrentes', m1 === 'new_fresh_token_123' && m2 === 'new_fresh_token_123');
  assert('Google OAuth foi chamado exatamente 1 vez (não 2x)', refreshCalls === 1, `refreshCalls=${refreshCalls}`);

  // ----------------------------------------------------
  // TESTE 4: Isolamento multi-tenant sequencial
  // ----------------------------------------------------
  console.log('\n--- 4. Teste Isolamento Multi-Tenant Sequencial ---');
  const runtime = new MaxAgentRuntime();
  const dispatchedTokens = [];

  global.fetch = async (url, opts) => {
    const authHeader = (opts && opts.headers && opts.headers.Authorization) || '';
    dispatchedTokens.push(authHeader.replace('Bearer ', ''));
    return {
      status: 200,
      ok: true,
      json: async () => ({ id: 'ev_' + Date.now(), summary: 'Compromisso', start: {}, end: {} })
    };
  };

  // Simula Turno Parceiro A com Token A
  await runtime.processTurn({ partnerId: 'partner_A', googleAccessToken: 'TOKEN_PARTNER_AAA', userMessage: 'consulta' });
  await runWithContext({ googleAccessToken: 'TOKEN_PARTNER_AAA', partnerId: 'partner_A' }, async () => {
    return runtime._dispatch('calendar_create', { summary: 'Event A' }, 'partner_A');
  });

  // Simula Turno Parceiro B com Token B
  await runtime.processTurn({ partnerId: 'partner_B', googleAccessToken: 'TOKEN_PARTNER_BBB', userMessage: 'consulta' });
  await runWithContext({ googleAccessToken: 'TOKEN_PARTNER_BBB', partnerId: 'partner_B' }, async () => {
    return runtime._dispatch('calendar_create', { summary: 'Event B' }, 'partner_B');
  });

  assert('Evento do Parceiro A usou TOKEN_PARTNER_AAA', dispatchedTokens[0] === 'TOKEN_PARTNER_AAA', `tokenA=${dispatchedTokens[0]}`);
  assert('Evento do Parceiro B usou TOKEN_PARTNER_BBB', dispatchedTokens[1] === 'TOKEN_PARTNER_BBB', `tokenB=${dispatchedTokens[1]}`);

  // ----------------------------------------------------
  // TESTE 5: Fallback GOOGLE_ACCESS_TOKEN bloqueado em produção
  // ----------------------------------------------------
  console.log('\n--- 5. Teste Fallback de ENV em Produção ---');
  process.env.NODE_ENV = 'production';
  process.env.GOOGLE_ACCESS_TOKEN = 'GLOBAL_LEAK_TOKEN';

  let noTokenWarn = false;
  const origWarn = console.warn;
  console.warn = (...args) => {
    if (args[0] && args[0].includes('dispatch_no_token')) noTokenWarn = true;
    origWarn(...args);
  };

  const dispatchProdRes = await runtime._dispatch('calendar_list', {}, 'partner_no_token');
  assert('Em produção sem token do parceiro, emite dispatch_no_token', noTokenWarn === true);
  assert('Em produção, resultado retorna NEED_OAUTH sem vazar global token', dispatchProdRes.reason === 'NEED_OAUTH');
  console.warn = origWarn;
  process.env.NODE_ENV = 'development';

  // ----------------------------------------------------
  // TESTE 6: 410 em _cancel (Already Gone / Idempotência)
  // ----------------------------------------------------
  console.log('\n--- 6. Teste 410 em _cancel ---');
  global.fetch = async (url, opts) => {
    if (opts && opts.method === 'DELETE') {
      return { status: 410, ok: false, json: async () => ({ error: { message: 'Resource has been deleted' } }) };
    }
    return { status: 200, ok: true };
  };

  const cancel410 = await GoogleCalendarConnector._cancel('token_123', { eventId: 'deleted_event_99' });
  assert('410 Gone retorna ok: true e alreadyGone: true', cancel410.ok === true && cancel410.alreadyGone === true);

  // ----------------------------------------------------
  // TESTE 7: extractClientName NLU robusto
  // ----------------------------------------------------
  console.log('\n--- 7. Teste extractClientName NLU Robusto ---');
  const n1 = runtime.extractClientName('amanhã às 17h');
  const n2 = runtime.extractClientName('João amanhã às 17h');
  const n3 = runtime.extractClientName('Meu nome é João Silva amanhã às 15h');
  const n4 = runtime.extractClientName('Pode marcar para o Carlos às 10 da manhã');
  const n5 = runtime.extractClientName('9 da manhã');
  const n6 = runtime.extractClientName('Ho amanhã às 14h');
  const n7 = runtime.extractClientName('de manhã às 8h');

  assert('"amanhã às 17h" -> null', n1 === null, `got: ${n1}`);
  assert('"João amanhã às 17h" -> João', n2 === 'João', `got: ${n2}`);
  assert('"Meu nome é João Silva amanhã às 15h" -> João Silva', n3 === 'João Silva', `got: ${n3}`);
  assert('"Pode marcar para o Carlos às 10 da manhã" -> Carlos', n4 === 'Carlos', `got: ${n4}`);
  assert('"9 da manhã" -> null', n5 === null, `got: ${n5}`);
  assert('"Ho amanhã às 14h" -> Ho', n6 === 'Ho', `got: ${n6}`);
  assert('"de manhã às 8h" -> null', n7 === null, `got: ${n7}`);

  // ----------------------------------------------------
  // TESTE 8: Isolamento multi-tenant sob CONCORRÊNCIA real (AsyncLocalStorage)
  // ----------------------------------------------------
  console.log('\n--- 8. Teste Isolamento Multi-Tenant CONCORRENTE ---');
  const runtime2 = new MaxAgentRuntime();
  const concurrentTokens = [];

  global.fetch = async (url, opts) => {
    const authHeader = (opts && opts.headers && opts.headers.Authorization) || '';
    const token = authHeader.replace('Bearer ', '');
    // Atrasa artificialmente a chamada do parceiro A para forçar sobreposição real
    if (token === 'TOKEN_CONCURRENT_A') {
      await new Promise((r) => setTimeout(r, 150));
    }
    concurrentTokens.push(token);
    return {
      status: 200,
      ok: true,
      json: async () => ({ id: 'ev_' + Date.now(), summary: 'Compromisso', start: {}, end: {} })
    };
  };

  concurrentTokens.length = 0;
  await Promise.all([
    runWithContext({ googleAccessToken: 'TOKEN_CONCURRENT_A', partnerId: 'partner_A' }, async () => {
      await new Promise((r) => setTimeout(r, 50)); // simula trabalho concorrente antes do dispatch
      return runtime2._dispatch('calendar_create', { summary: 'Event A' }, 'partner_A');
    }),
    runWithContext({ googleAccessToken: 'TOKEN_CONCURRENT_B', partnerId: 'partner_B' }, async () => {
      return runtime2._dispatch('calendar_create', { summary: 'Event B' }, 'partner_B');
    })
  ]);

  assert(
    'Sob concorrência real, cada _dispatch usou o token do seu próprio contexto',
    concurrentTokens.includes('TOKEN_CONCURRENT_A') && concurrentTokens.includes('TOKEN_CONCURRENT_B'),
    'tokens=' + JSON.stringify(concurrentTokens)
  );

  // ----------------------------------------------------
  // TESTE 9: extractClientName rejeita nome de serviço sem nome de cliente
  // ----------------------------------------------------
  console.log('\n--- 9. Teste extractClientName rejeita serviço puro ---');
  const s1 = runtime.extractClientName('Corte de cabelo às 15h');
  const s2 = runtime.extractClientName('Manicure amanhã de manhã');
  const s3 = runtime.extractClientName('Quero agendar um corte para o Pedro às 14h');

  assert('"Corte de cabelo às 15h" -> null (não confunde serviço com nome)', s1 === null, 'got: ' + s1);
  assert('"Manicure amanhã de manhã" -> null', s2 === null, 'got: ' + s2);
  assert('"Quero agendar um corte para o Pedro às 14h" -> Pedro (nome real ainda funciona)', s3 === 'Pedro', 'got: ' + s3);

  global.fetch = origFetch;

  console.log('\n====================================================');
  console.log(`📊 RESULTADO: ${passed}/${total} TESTES PASSARAM COM SUCESSO! (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================');
}

runRigorousTestSuite().catch(console.error);
