'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const { DatabaseManager } = require('../core/storage/DatabaseManager');
const { PartnerRepository } = require('../core/storage/repositories/PartnerRepository');
const { AuthRepository } = require('../core/storage/repositories/AuthRepository');
const { CustomerRepository } = require('../core/storage/repositories/CustomerRepository');
const { ConversationRepository } = require('../core/storage/repositories/ConversationRepository');
const { AppointmentRepository } = require('../core/storage/repositories/AppointmentRepository');
const { OrderRepository } = require('../core/storage/repositories/OrderRepository');
const { QueueRepository } = require('../core/storage/repositories/QueueRepository');

const { CatalogService } = require('../core/domain/CatalogService');
const { BookingService } = require('../core/domain/BookingService');
const { OrderService } = require('../core/domain/OrderService');
const { CustomerService } = require('../core/domain/CustomerService');
const { PdfService } = require('../core/domain/PdfService');

const { PromptPin } = require('../core/ai/PromptPin');
const { AgentEngine } = require('../core/ai/AgentEngine');

const { WhatsAppBaileysAdapter } = require('../core/messaging/adapters/WhatsAppBaileysAdapter');
const { SessionManager } = require('../core/messaging/SessionManager');
const { MessageDebouncer } = require('../core/messaging/MessageDebouncer');
const { OutboundQueueWorker } = require('../core/messaging/OutboundQueueWorker');
const { PauseController } = require('../core/messaging/PauseController');

const { CorsMiddleware } = require('../core/gateway/middlewares/CorsMiddleware');
const { AuthMiddleware } = require('../core/gateway/middlewares/AuthMiddleware');
const { SseManager } = require('../core/gateway/events/SseManager');
const { WebhookDispatcher } = require('../core/gateway/events/WebhookDispatcher');
const { GatewayServer } = require('../core/gateway/Server');
const { LifecycleManager } = require('../core/lifecycle/LifecycleManager');
const { bootstrap } = require('../bin/start');

async function createE2EFixture(options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-l5-'));
  const sessionsDir = path.join(tmpDir, 'sessions');
  const dbPath = path.join(tmpDir, 'e2e.db');

  const lifecycle = new LifecycleManager({ drainTimeoutMs: 2000 });
  const dbManager = new DatabaseManager({ dbPath });
  dbManager.init();
  lifecycle.register('sqlite-db', () => dbManager.close());

  const partnerRepository = new PartnerRepository(dbManager);
  const authRepository = new AuthRepository(dbManager);
  const customerRepository = new CustomerRepository(dbManager);
  const conversationRepository = new ConversationRepository(dbManager);
  const appointmentRepository = new AppointmentRepository(dbManager);
  const orderRepository = new OrderRepository(dbManager);
  const queueRepository = new QueueRepository(dbManager);

  const catalogService = new CatalogService({ dbManager });
  const bookingService = new BookingService({
    dbManager,
    appointmentRepository,
    partnerRepository,
  });
  const orderService = new OrderService({ dbManager, orderRepository });
  const customerService = new CustomerService({ dbManager, customerRepository });
  const pdfService = new PdfService();
  const promptPin = new PromptPin();
  promptPin.verifyAtBoot({ strict: true });

  const mockRouter = options.llmRouter || {
    circuitBreaker: { groq: { status: 'CLOSED' } },
    async generate() {
      return {
        ok: true,
        status: 'SUCCESS',
        providerUsed: 'mock',
        model: 'mock-1',
        text: 'Olá!',
        toolCalls: [],
      };
    },
  };

  const agentEngine = new AgentEngine({
    dbManager,
    llmRouter: mockRouter,
    promptPin,
    catalogService,
    bookingService,
    orderService,
    customerService,
    partnerRepository,
    conversationRepository,
    appointmentRepository,
    orderRepository,
  });

  const sentSockets = [];
  const mockSock = {
    user: { id: '5511000000000:1@s.whatsapp.net' },
    ev: new EventEmitter(),
    ws: { close() {} },
    end() {},
    async sendPresenceUpdate() {},
    async readMessages() {},
    async sendMessage(jid, content) {
      sentSockets.push({ jid, content });
      return { key: { id: `wa_out_${sentSockets.length}` } };
    },
  };

  let sessionManagerRef = null;
  const baileysAdapter = new WhatsAppBaileysAdapter({
    authDirResolver: (sk) => sessionManagerRef.resolveSessionPaths(sk).authDir,
    partnerIdResolver: () => 'prt-e2e',
    baileysLoader: () => ({
      makeWASocket: () => mockSock,
      useMultiFileAuthState: async () => ({
        state: { creds: {}, keys: {} },
        saveCreds: async () => {},
      }),
      DisconnectReason: { loggedOut: 401 },
      Browsers: { ubuntu: () => ['Ubuntu', 'Chrome', '22'] },
    }),
    qrCodeLoader: () => ({
      async toDataURL(qr) {
        return `data:image/png;base64,${Buffer.from(qr).toString('base64')}`;
      },
    }),
  });

  const pauseController = new PauseController({ conversationRepository });
  const debouncer = new MessageDebouncer({ windowMs: 25 });
  const outboxWorker = new OutboundQueueWorker({
    queueRepository,
    channelAdapter: baileysAdapter,
    minPresenceMs: 0,
    maxPresenceMs: 0,
  });

  const sessionManager = new SessionManager({
    dbManager,
    sessionsDir,
    channelAdapter: baileysAdapter,
    agentEngine,
    pauseController,
    debouncer,
    outboxWorker,
    partnerRepository,
    customerRepository,
    conversationRepository,
    queueRepository,
  });
  sessionManagerRef = sessionManager;
  sessionManager.bindInboundPipeline();
  lifecycle.register('messaging-sessions', () => sessionManager.close());

  const jwtSecret = 'test-jwt-secret-key-at-least-32-bytes';
  const webhookSecret = 'test-webhook-secret-key-32-bytes';
  const internalApiKey = 'test-internal-api-key';

  const authMiddleware = new AuthMiddleware({
    jwtSecret,
    internalApiKey,
    authRepository,
  });
  const sseManager = new SseManager({ heartbeatMs: 0 });
  const webhookCalls = [];
  const webhookDispatcher = new WebhookDispatcher({
    signingSecret: webhookSecret,
    partnerRepository,
    sseManager,
    maxRetries: 0,
    fetchImpl: async (url, init) => {
      webhookCalls.push({ url, init, body: JSON.parse(init.body), rawBody: init.body });
      return { ok: true, status: 200, async text() { return 'ok'; } };
    },
  });

  const server = new GatewayServer({
    dbManager,
    partnerRepository,
    authRepository,
    conversationRepository,
    appointmentRepository,
    queueRepository,
    catalogService,
    bookingService,
    orderService,
    pdfService,
    promptPin,
    llmRouter: mockRouter,
    sessionManager,
    pauseController,
    corsMiddleware: new CorsMiddleware({ allowedOrigins: ['http://localhost:3000'] }),
    authMiddleware,
    sseManager,
    webhookDispatcher,
  });
  lifecycle.register('http-gateway', () => server.close());

  const listenInfo = await server.listen({ port: 0, host: '127.0.0.1' });

  return {
    tmpDir,
    baseUrl: listenInfo.baseUrl,
    internalApiKey,
    webhookSecret,
    lifecycle,
    dbManager,
    partnerRepository,
    sessionManager,
    outboxWorker,
    baileysAdapter,
    mockSock,
    sentSockets,
    webhookCalls,
    async cleanup() {
      await lifecycle.shutdown('test-cleanup');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe('Layer 5 — Gateway REST, Eventos/Webhooks & Boot E2E', () => {
  test('1. Proteção de Rotas: rotas protegidas sem credencial retornam 401; /health e /register são isentas', async () => {
    const fx = await createE2EFixture();
    try {
      // Exempt /health
      const healthRes = await fetch(`${fx.baseUrl}/health`);
      assert.equal(healthRes.status, 200);
      const healthJson = await healthRes.json();
      assert.deepEqual(healthJson, { ok: true, status: 'healthy' });

      // Protected route without auth -> 401
      const unauthCatalog = await fetch(
        `${fx.baseUrl}/api/v1/partners/prt-1/catalog`
      );
      assert.equal(unauthCatalog.status, 401);
      const unauthBody = await unauthCatalog.json();
      assert.equal(unauthBody.ok, false);
      assert.equal(unauthBody.error.code, 'UNAUTHORIZED');

      // Invalid API key -> 401
      const badKey = await fetch(`${fx.baseUrl}/api/v1/readiness`, {
        headers: { 'x-api-key': 'wrong-key' },
      });
      assert.equal(badKey.status, 401);

      // Valid API key -> 200 readiness
      const readyRes = await fetch(`${fx.baseUrl}/api/v1/readiness`, {
        headers: { 'x-api-key': fx.internalApiKey },
      });
      assert.equal(readyRes.status, 200);
      const readyJson = await readyRes.json();
      assert.equal(readyJson.ok, true);
      assert.equal(readyJson.data.status, 'READY');
      assert.equal(readyJson.data.checks.database.driver, 'node:sqlite');
      assert.equal(readyJson.data.checks.promptPin.status, 'MATCH');
    } finally {
      await fx.cleanup();
    }
  });

  test('2. Fluxo E2E de Agendamento: REST catalog -> Baileys mock -> AgentEngine -> GET /appointments + PDF', async () => {
    let step = 0;
    const fx = await createE2EFixture({
      llmRouter: {
        circuitBreaker: {},
        async generate() {
          step += 1;
          if (step === 1) {
            return {
              ok: true,
              status: 'SUCCESS',
              providerUsed: 'mock',
              model: 'm1',
              text: '',
              toolCalls: [
                {
                  id: 'call_e2e_book',
                  name: 'book_service',
                  arguments: {
                    item_id: 'svc-e2e-1',
                    date_str: '2026-12-20',
                    time_slot: '14:00',
                    client_name: 'Maria Clara',
                    confirmed: true,
                  },
                },
              ],
            };
          }
          return {
            ok: true,
            status: 'SUCCESS',
            providerUsed: 'mock',
            model: 'm1',
            text: 'Seu agendamento de Corte E2E (R$ 75,00) está confirmado!',
            toolCalls: [],
          };
        },
      },
    });

    try {
      // Register partner via REST and obtain JWT Bearer token
      const regRes = await fetch(`${fx.baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'prt-e2e',
          email: 'e2e@autonmax.dev',
          password: 'Password@123',
          displayName: 'Salão E2E',
        }),
      });
      assert.equal(regRes.status, 201);
      const regJson = await regRes.json();
      const token = regJson.data.token;
      const partnerId = regJson.data.partner.id;

      // Cross-tenant Bearer access blocked with 403
      const crossTenant = await fetch(
        `${fx.baseUrl}/api/v1/partners/other-partner/catalog`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      assert.equal(crossTenant.status, 403);

      // Create SERVICE item via REST
      const catRes = await fetch(
        `${fx.baseUrl}/api/v1/partners/${partnerId}/catalog`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: 'svc-e2e-1',
            name: 'Corte E2E',
            type: 'SERVICE',
            priceCents: 7500,
            durationMinutes: 30,
          }),
        }
      );
      assert.equal(catRes.status, 201);

      // Connect mock WhatsApp session via REST
      const sessRes = await fetch(`${fx.baseUrl}/api/v1/channels/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ partnerId, lineId: 'default' }),
      });
      assert.equal(sessRes.status, 201);

      // Simulate WhatsApp inbound booking message via Baileys adapter
      fx.mockSock.ev.emit('messages.upsert', {
        type: 'notify',
        messages: [
          {
            key: {
              id: 'wa-e2e-book-1',
              fromMe: false,
              remoteJid: '5511999991234@s.whatsapp.net',
            },
            pushName: 'Maria Clara',
            message: {
              conversation: 'Quero confirmar Corte E2E dia 20/12/2026 às 14:00',
            },
          },
        ],
      });

      // Wait for debounce + AgentEngine + outbox commit
      await new Promise((r) => setTimeout(r, 90));
      const delivered = await fx.outboxWorker.processOnce();
      assert.equal(delivered.sent, 1);
      assert.match(fx.sentSockets[0].content.text, /\[COMPROVANTE OFICIAL DE AGENDAMENTO\]/);

      // Verify REST GET /appointments/summary and /appointments
      const sumRes = await fetch(
        `${fx.baseUrl}/api/v1/partners/${partnerId}/appointments/summary?date=2026-12-20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      assert.equal(sumRes.status, 200);
      const sumJson = await sumRes.json();
      assert.equal(sumJson.data.confirmedCount, 1);
      assert.equal(sumJson.data.totalConfirmedCents, 7500);

      const listRes = await fetch(
        `${fx.baseUrl}/api/v1/partners/${partnerId}/appointments?date=2026-12-20&status=CONFIRMED`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      assert.equal(listRes.status, 200);
      const listJson = await listRes.json();
      assert.equal(listJson.data.length, 1);
      assert.equal(listJson.data[0].item_name_snapshot, 'Corte E2E');
      assert.equal(listJson.data[0].price_cents_snapshot, 7500);

      // Verify binary PDF endpoint
      const pdfRes = await fetch(
        `${fx.baseUrl}/api/v1/partners/${partnerId}/appointments/pdf?date=2026-12-20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      assert.equal(pdfRes.status, 200);
      assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
      const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
      assert.ok(pdfBytes.toString('utf8').startsWith('%PDF-1.4'));
    } finally {
      await fx.cleanup();
    }
  });

  test('3. Fluxo E2E de Pedido: REST catalog -> Baileys mock -> AgentEngine -> GET /orders/summary com total_cents do SQLite', async () => {
    let step = 0;
    const fx = await createE2EFixture({
      llmRouter: {
        circuitBreaker: {},
        async generate() {
          step += 1;
          if (step === 1) {
            return {
              ok: true,
              status: 'SUCCESS',
              providerUsed: 'mock',
              model: 'm1',
              text: '',
              toolCalls: [
                {
                  id: 'call_e2e_order',
                  name: 'create_order',
                  arguments: {
                    items: [{ item_id: 'prd-e2e-1', qty: 3 }],
                    client_name: 'Roberto',
                    delivery_type: 'PICKUP',
                    payment_method: 'PIX',
                    confirmed: true,
                  },
                },
              ],
            };
          }
          return {
            ok: true,
            status: 'SUCCESS',
            providerUsed: 'mock',
            model: 'm1',
            text: 'Pedido confirmado! Total de R$ 135,00.',
            toolCalls: [],
          };
        },
      },
    });

    try {
      const regRes = await fetch(`${fx.baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'prt-e2e',
          email: 'orders@autonmax.dev',
          password: 'Password@123',
          displayName: 'Loja E2E',
        }),
      });
      const { token } = (await regRes.json()).data;

      // Create PRODUCT via REST (priceCents = 4500 => 3x = 13500)
      const catRes = await fetch(
        `${fx.baseUrl}/api/v1/partners/prt-e2e/catalog`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: 'prd-e2e-1',
            name: 'Kit Barba E2E',
            type: 'PRODUCT',
            priceCents: 4500,
          }),
        }
      );
      assert.equal(catRes.status, 201);

      await fetch(`${fx.baseUrl}/api/v1/channels/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ partnerId: 'prt-e2e', lineId: 'default' }),
      });

      fx.mockSock.ev.emit('messages.upsert', {
        type: 'notify',
        messages: [
          {
            key: {
              id: 'wa-e2e-ord-1',
              fromMe: false,
              remoteJid: '5511999995678@s.whatsapp.net',
            },
            pushName: 'Roberto',
            message: { conversation: 'Quero 3 unidades do Kit Barba E2E, confirmado!' },
          },
        ],
      });

      await new Promise((r) => setTimeout(r, 90));
      const delivered = await fx.outboxWorker.processOnce();
      assert.equal(delivered.sent, 1);
      assert.match(fx.sentSockets[0].content.text, /\[COMPROVANTE OFICIAL DE PEDIDO\]/);

      const sumRes = await fetch(
        `${fx.baseUrl}/api/v1/partners/prt-e2e/orders/summary`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      assert.equal(sumRes.status, 200);
      const sumJson = await sumRes.json();
      assert.equal(sumJson.data.confirmedCount, 1);
      assert.equal(sumJson.data.totalRevenueCents, 13500);
      assert.equal(sumJson.data.orders[0].total_cents, 13500);
    } finally {
      await fx.cleanup();
    }
  });

  test('4. Painel de Chaves (403 FEATURE_DISABLED), Idempotência Offline (X-Idempotency-Key), 409 SLOT_TAKEN e Webhooks HMAC', async () => {
    const fx = await createE2EFixture();
    try {
      const regRes = await fetch(`${fx.baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'prt-flags',
          email: 'flags@autonmax.dev',
          password: 'Password@123',
          displayName: 'Flags Store',
        }),
      });
      const { token } = (await regRes.json()).data;

      // Enable webhooks & configure target URL
      await fetch(`${fx.baseUrl}/api/v1/partners/prt-flags/features`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ webhooks: true, orders: false }),
      });
      await fetch(`${fx.baseUrl}/api/v1/partners/prt-flags/webhooks`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUrl: 'https://hooks.example.test/autonmax' }),
      });

      // Create SERVICE and PRODUCT
      await fetch(`${fx.baseUrl}/api/v1/partners/prt-flags/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: 'svc-flag',
          name: 'Atendimento VIP',
          type: 'SERVICE',
          priceCents: 10000,
          durationMinutes: 30,
        }),
      });
      await fetch(`${fx.baseUrl}/api/v1/partners/prt-flags/catalog`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: 'prd-flag',
          name: 'Produto Bloqueado',
          type: 'PRODUCT',
          priceCents: 2500,
        }),
      });

      // 4a. Disabled "orders" feature returns HTTP 403 FEATURE_DISABLED
      const blockedOrder = await fetch(
        `${fx.baseUrl}/api/v1/partners/prt-flags/orders`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            clientName: 'Cliente X',
            items: [{ itemId: 'prd-flag', qty: 1 }],
            confirmed: true,
          }),
        }
      );
      assert.equal(blockedOrder.status, 403);
      const blockedJson = await blockedOrder.json();
      assert.equal(blockedJson.error.code, 'FEATURE_DISABLED');

      // 4b. Offline Idempotency via X-Idempotency-Key returns original without duplicating
      const idemKey = 'offline-sync-uuid-001';
      const appt1 = await fetch(
        `${fx.baseUrl}/api/v1/partners/prt-flags/appointments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Idempotency-Key': idemKey,
          },
          body: JSON.stringify({
            itemId: 'svc-flag',
            clientName: 'Ana Sync',
            dateStr: '2026-12-22',
            timeSlot: '16:00',
          }),
        }
      );
      assert.equal(appt1.status, 201);
      const appt1Json = await appt1.json();

      const apptReplay = await fetch(
        `${fx.baseUrl}/api/v1/partners/prt-flags/appointments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Idempotency-Key': idemKey,
          },
          body: JSON.stringify({
            itemId: 'svc-flag',
            clientName: 'Ana Sync',
            dateStr: '2026-12-22',
            timeSlot: '16:00',
          }),
        }
      );
      assert.equal(apptReplay.status, 200);
      const apptReplayJson = await apptReplay.json();
      assert.equal(apptReplayJson.data.idempotent, true);
      assert.equal(apptReplayJson.data.appointmentId, appt1Json.data.appointmentId);

      // 4c. Different idempotency key on same occupied slot -> 409 SLOT_TAKEN
      const apptConflict = await fetch(
        `${fx.baseUrl}/api/v1/partners/prt-flags/appointments`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Idempotency-Key': 'offline-sync-uuid-002',
          },
          body: JSON.stringify({
            itemId: 'svc-flag',
            clientName: 'Outro Cliente',
            dateStr: '2026-12-22',
            timeSlot: '16:00',
          }),
        }
      );
      assert.equal(apptConflict.status, 409);
      const conflictJson = await apptConflict.json();
      assert.equal(conflictJson.error.code, 'SLOT_TAKEN');

      // 4d. Signed HMAC-SHA256 webhook delivered once (not on replay)
      assert.equal(fx.webhookCalls.length, 1);
      const wh = fx.webhookCalls[0];
      assert.equal(wh.body.eventType, 'appointment.confirmed');
      const expectedSig =
        'sha256=' +
        crypto
          .createHmac('sha256', fx.webhookSecret)
          .update(wh.rawBody, 'utf8')
          .digest('hex');
      assert.equal(wh.init.headers['X-Autonmax-Signature'], expectedSig);
    } finally {
      await fx.cleanup();
    }
  });

  test('5. Boot oficial (vnext/bin/start.js) + Rotas de Conversa/Soft-Pause + Encerramento limpo via LifecycleManager', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-l5-boot-'));
    const dbPath = path.join(tmpDir, 'boot.db');
    const sessionsDir = path.join(tmpDir, 'sessions');

    const bootCtx = await bootstrap({
      dbPath,
      sessionsDir,
      port: 0,
      host: '127.0.0.1',
      startWorker: false,
      installSignals: false,
      channelAdapter: {
        async connect() {},
        async disconnect() {},
        async getStatus() { return 'CONNECTED'; },
        async getQr() { return null; },
        async sendMessage() { return { messageId: 'm1', timestamp: new Date().toISOString() }; },
        async sendPresence() {},
        onMessage() { return () => {}; },
        async close() {},
      },
    });

    try {
      const hRes = await fetch(`${bootCtx.listenInfo.baseUrl}/health`);
      assert.equal(hRes.status, 200);

      // Register partner, create customer + conversation, test soft-pause & operator-message
      const regRes = await fetch(`${bootCtx.listenInfo.baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'prt-boot',
          email: 'boot@autonmax.dev',
          password: 'Password@123',
          displayName: 'Boot Lab',
        }),
      });
      const { token } = (await regRes.json()).data;

      const custRepo = new CustomerRepository(bootCtx.dbManager);
      const convRepo = new ConversationRepository(bootCtx.dbManager);
      const cust = custRepo.upsert({
        partnerId: 'prt-boot',
        channel: 'whatsapp',
        externalId: '5511999990000@s.whatsapp.net',
        name: 'Helena',
      });
      const conv = convRepo.upsertConversation({
        partnerId: 'prt-boot',
        customerId: cust.id,
        channel: 'whatsapp',
        externalChatId: '5511999990000@s.whatsapp.net',
      });

      const pauseRes = await fetch(
        `${bootCtx.listenInfo.baseUrl}/api/v1/partners/prt-boot/conversations/${conv.id}/pause`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ paused: true }),
        }
      );
      assert.equal(pauseRes.status, 200);
      assert.equal((await pauseRes.json()).data.is_paused, 1);

      const opRes = await fetch(
        `${bootCtx.listenInfo.baseUrl}/api/v1/partners/prt-boot/conversations/${conv.id}/operator-message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ text: 'Olá Helena, aqui é o gerente!' }),
        }
      );
      assert.equal(opRes.status, 201);

      const msgsRes = await fetch(
        `${bootCtx.listenInfo.baseUrl}/api/v1/partners/prt-boot/conversations/${conv.id}/messages`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msgsJson = await msgsRes.json();
      assert.equal(msgsJson.data.length, 1);
      assert.equal(msgsJson.data[0].role, 'operator');

      const shutdownResult = await bootCtx.lifecycle.shutdown('test-boot-done');
      assert.equal(shutdownResult.ok, true);
      assert.equal(bootCtx.dbManager.isOpen(), false);
    } finally {
      await bootCtx.lifecycle.shutdown('finally');
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('6. SERVE_STATIC_UI=true serve app-web/dist com fallback SPA e proteção contra path traversal', async () => {
    const tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-l5-static-'));
    fs.writeFileSync(path.join(tmpDist, 'index.html'), '<html><body>AUTONMAX SPA</body></html>');
    fs.mkdirSync(path.join(tmpDist, 'src', 'theme'), { recursive: true });
    fs.writeFileSync(path.join(tmpDist, 'src', 'theme', 'tokens.css'), ':root { --x: 1; }');

    const fx = await createE2EFixture();
    // Enable static UI serving on a dedicated server instance or directly on fx via clean toggle
    const staticServer = new GatewayServer({
      ...fx.lifecycle,
      dbManager: fx.dbManager,
      partnerRepository: fx.partnerRepository,
      authRepository: new AuthRepository(fx.dbManager),
      conversationRepository: new ConversationRepository(fx.dbManager),
      appointmentRepository: new AppointmentRepository(fx.dbManager),
      queueRepository: new QueueRepository(fx.dbManager),
      catalogService: new CatalogService({ dbManager: fx.dbManager }),
      bookingService: new BookingService({ dbManager: fx.dbManager }),
      orderService: new OrderService({ dbManager: fx.dbManager }),
      pdfService: new PdfService(),
      sessionManager: fx.sessionManager,
      pauseController: new PauseController({
        conversationRepository: new ConversationRepository(fx.dbManager),
      }),
      serveStaticUi: true,
      staticDistDir: tmpDist,
    });
    const info = await staticServer.listen({ port: 0, host: '127.0.0.1' });

    try {
      const rootRes = await fetch(`${info.baseUrl}/`);
      assert.equal(rootRes.status, 200);
      assert.match(await rootRes.text(), /AUTONMAX SPA/);

      const cssRes = await fetch(`${info.baseUrl}/src/theme/tokens.css`);
      assert.equal(cssRes.status, 200);
      assert.match(cssRes.headers.get('content-type'), /text\/css/);

      // SPA route fallback
      const spaRes = await fetch(`${info.baseUrl}/agenda/hoje`);
      assert.equal(spaRes.status, 200);
      assert.match(await spaRes.text(), /AUTONMAX SPA/);

      // API unknown route still returns JSON 404, not index.html
      const apiRes = await fetch(`${info.baseUrl}/api/v1/unknown`);
      assert.equal(apiRes.status, 404);
      assert.match(apiRes.headers.get('content-type'), /application\/json/);

      // Path traversal blocked
      const travRes = await fetch(`${info.baseUrl}/..%2Fpackage.json`);
      assert.equal(travRes.status, 403);
    } finally {
      await staticServer.close();
      await fx.cleanup();
      fs.rmSync(tmpDist, { recursive: true, force: true });
    }
  });
});
