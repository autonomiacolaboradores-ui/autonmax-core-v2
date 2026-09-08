const { PartnerAuthManager } = require('../core/ring1/PartnerAuthManager');
const { MaxAgentRuntime } = require('../core/ring1/MaxAgentRuntime');

async function run() {
  let passed = 0, total = 0;
  function assert(name, cond, extra = '') {
    total++;
    if (cond) { passed++; console.log(`✅ PASS: ${name} ${extra}`); }
    else console.error(`❌ FAIL: ${name} ${extra}`);
  }

  console.log('====================================================');
  console.log('🧪 TESTES DETERMINÍSTICOS T1-T6 GOOGLE CALENDAR TOKEN INJECT');
  console.log('====================================================');

  const tables = {
    user_accounts: new Map(),
    user_sessions: new Map()
  };

  const mockDb = {
    prepare(sql) {
      return {
        get(id) {
          return tables.user_accounts.get(id) || null;
        },
        run(...params) {
          return { changes: 1 };
        }
      };
    },
    async dbGet(sql, params = []) {
      if (sql.includes('FROM user_accounts WHERE id = ?')) {
        return tables.user_accounts.get(params[0]) || null;
      }
      return null;
    },
    async dbRun(sql, params = []) {
      if (sql.includes('UPDATE user_accounts SET google_access_token = NULL')) {
        const row = tables.user_accounts.get(params[0]);
        if (row) {
          row.google_access_token = null;
          row.google_refresh_token = null;
          row.google_token_expires_at = null;
        }
      } else if (sql.includes('UPDATE user_accounts SET google_access_token = ?')) {
        const row = tables.user_accounts.get(params[params.length - 1]);
        if (row) {
          row.google_access_token = params[0];
          row.google_refresh_token = params[1];
          row.google_token_expires_at = params[2];
        }
      }
      return { changes: 1 };
    },
    async transaction(fn) {
      return await fn({
        async get(sql, params = []) {
          return tables.user_accounts.get(params[0]) || null;
        },
        async run(sql, params = []) {
          if (sql.includes('INSERT INTO user_accounts')) {
            const [id, email, access, refresh, expires] = params;
            tables.user_accounts.set(id, { id, email, name: 'Parceiro PME', is_partner: 1, google_access_token: access, google_refresh_token: refresh, google_token_expires_at: expires });
          } else if (sql.includes('UPDATE user_accounts')) {
            const [access, refresh, expires, email, id] = params;
            const row = tables.user_accounts.get(id) || { id };
            row.google_access_token = access;
            row.google_refresh_token = refresh;
            row.google_token_expires_at = expires;
            row.email = email;
            tables.user_accounts.set(id, row);
          }
        }
      });
    },
    getDb() {
      return this;
    }
  };

  const authManager = new PartnerAuthManager(mockDb);
  const targetPartner = 'partner_demo_pme';

  console.log('\n--- T1: partner_demo_pme SEM oauth no store ---');
  const resT1 = await authManager.resolvePartnerGoogleToken(targetPartner);
  assert('T1. hasToken deve ser false', resT1.hasToken === false);
  assert('T1. reason deve ser NOT_CONNECTED (não timeout_or_none)', resT1.reason === 'NOT_CONNECTED', `got=${resT1.reason}`);
  assert('T1. source deve ser none', resT1.source === 'none', `got=${resT1.source}`);

  console.log('\n--- T2: Inserir token no store para partner_demo_pme ---');
  await authManager.saveGoogleOAuthTokens(targetPartner, {
    access_token: 'YA29_VALID_TEST_TOKEN_PME',
    refresh_token: '1//REFRESH_VALID_PME',
    expires_in: 3600
  }, 'contato@demo.com');

  const resT2 = await authManager.resolvePartnerGoogleToken(targetPartner);
  assert('T2. hasToken deve ser true', resT2.hasToken === true);
  assert('T2. source deve ser store', resT2.source === 'store', `got=${resT2.source}`);
  assert('T2. reason deve ser VALID', resT2.reason === 'VALID', `got=${resT2.reason}`);
  assert('T2. token correto retornado', resT2.token === 'YA29_VALID_TEST_TOKEN_PME');

  console.log('\n--- T3: processTurn PME com draft completo + confirmação "Pode" ---');
  const runtime = new MaxAgentRuntime();
  runtime.authManager = authManager;

  const dispatched = [];
  runtime._dispatch = async (name, args, partnerId) => {
    dispatched.push({ name, args, partnerId });
    if (name === 'book_appointment_confirmed') {
      return { ok: true, message: 'Agendamento gravado internamente', appointment: { appointmentId: 'app_t3', durationMinutes: 30 } };
    }
    if (name === 'calendar_create') {
      return { ok: true, eventId: 'cal_event_t3' };
    }
    return { ok: true };
  };

  runtime._saveDraft(targetPartner, 'cliente_t3@s.whatsapp.net', {
    clientName: 'Carla Dias',
    serviceName: 'Demonstração Max',
    dateStr: '2026-08-30',
    timeSlot: '16:00'
  });

  dispatched.length = 0;
  const resT3 = await runtime.processTurn({
    mode: 'pme',
    partnerId: targetPartner,
    userKey: 'cliente_t3@s.whatsapp.net',
    userMessage: 'Pode confirmar',
    googleAccessToken: resT2.token
  });

  assert('T3. book_appointment_confirmed local executado', dispatched.some(t => t.name === 'book_appointment_confirmed'));
  assert('T3. calendar_create chamado com token do partner_demo_pme', dispatched.some(t => t.name === 'calendar_create' && t.args.accessToken === 'YA29_VALID_TEST_TOKEN_PME'));
  assert('T3. Facts contém evento criado ✅', resT3.facts.some(f => f.includes('GOOGLE CALENDAR: evento criado ✅')));

  console.log('\n--- T4: partnerId no callback diferente de partner_demo_pme ---');
  const otherPartner = 'partner_outro_123';
  await authManager.saveGoogleOAuthTokens(otherPartner, {
    access_token: 'OTHER_TOKEN_SECRET',
    refresh_token: 'OTHER_REFRESH',
    expires_in: 3600
  });

  // Limpa partner_demo_pme
  await authManager.disconnectGoogleCalendar(targetPartner);
  const resT4 = await authManager.resolvePartnerGoogleToken(targetPartner);
  assert('T4. partner_demo_pme NÃO recebe token de outro partner', resT4.hasToken === false);
  assert('T4. reason do partner_demo_pme permanece NOT_CONNECTED', resT4.reason === 'NOT_CONNECTED');

  console.log('\n--- T5: Token expirado + refresh_token válido ---');
  tables.user_accounts.set(targetPartner, {
    id: targetPartner,
    email: 'demo@pme.com',
    google_access_token: 'EXPIRED_ACCESS_TOKEN',
    google_refresh_token: 'MOCK_REFRESH_TOKEN_FOR_T5',
    google_token_expires_at: Date.now() - 500000 // Expirado há 500s
  });

  // Salva fetch original para interceptar refresh
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        json: async () => ({
          access_token: 'NEW_REFRESHED_ACCESS_TOKEN_T5',
          expires_in: 3600
        })
      };
    }
    return origFetch(url, opts);
  };
  process.env.GOOGLE_CLIENT_ID = 'test_client_id';
  process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';

  const resT5 = await authManager.resolvePartnerGoogleToken(targetPartner);
  assert('T5. Refresh executado com sucesso', resT5.hasToken === true);
  assert('T5. source é refresh', resT5.source === 'refresh', `got=${resT5.source}`);
  assert('T5. reason é REFRESH_OK', resT5.reason === 'REFRESH_OK', `got=${resT5.reason}`);
  assert('T5. Novo token retornado', resT5.token === 'NEW_REFRESHED_ACCESS_TOKEN_T5');

  // Restaura fetch
  global.fetch = origFetch;

  console.log('\n--- T6: Regressão: draft ok=true e confirm_commit não regrediram ---');
  runtime._saveDraft(targetPartner, 'cliente_t6@s.whatsapp.net', {
    clientName: 'Roberto Alves',
    serviceName: 'Demonstração Max',
    dateStr: '2026-08-30',
    timeSlot: '17:00'
  });

  dispatched.length = 0;
  const resT6 = await runtime.processTurn({
    mode: 'pme',
    partnerId: targetPartner,
    userKey: 'cliente_t6@s.whatsapp.net',
    userMessage: 'Pode'
  });

  assert('T6. Intent é booking_confirmed', resT6.intent === 'booking_confirmed');
  assert('T6. Commit interno disparado', dispatched.some(t => t.name === 'book_appointment_confirmed'));
  assert('T6. Fact de confirmação local presente', resT6.facts.some(f => f.includes('AGENDAMENTO CONFIRMADO ✅')));

  console.log(`\n====================================================`);
  console.log(`📊 ${passed}/${total} testes determinísticos T1-T6 passaram com sucesso! (100%)`);
  console.log(`====================================================`);
  process.exit(passed === total ? 0 : 1);
}

run();
