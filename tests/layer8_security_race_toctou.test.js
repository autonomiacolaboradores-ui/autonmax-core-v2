'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { LifecycleManager } = require('../core/lifecycle/LifecycleManager');
const { DatabaseManager } = require('../core/storage/DatabaseManager');
const { PartnerRepository } = require('../core/storage/repositories/PartnerRepository');
const { AuthRepository } = require('../core/storage/repositories/AuthRepository');
const { CustomerRepository } = require('../core/storage/repositories/CustomerRepository');
const { ConversationRepository } = require('../core/storage/repositories/ConversationRepository');
const { CatalogRepository } = require('../core/storage/repositories/CatalogRepository');
const { AppointmentRepository } = require('../core/storage/repositories/AppointmentRepository');
const { OrderRepository } = require('../core/storage/repositories/OrderRepository');
const { QueueRepository } = require('../core/storage/repositories/QueueRepository');

const { CatalogService } = require('../core/domain/CatalogService');
const { BookingService } = require('../core/domain/BookingService');
const { OrderService } = require('../core/domain/OrderService');
const { PdfService } = require('../core/domain/PdfService');
const { slotToMinutes } = require('../core/domain/RegionalNormalizer');

const { ChannelAdapter } = require('../core/messaging/ChannelAdapter');
const { PauseController } = require('../core/messaging/PauseController');
const { MessageDebouncer } = require('../core/messaging/MessageDebouncer');
const { OutboundQueueWorker } = require('../core/messaging/OutboundQueueWorker');
const { SessionManager } = require('../core/messaging/SessionManager');

const { GatewayServer } = require('../core/gateway/Server');
const { hashPassword } = require('../core/gateway/routes/AuthRoutes');

const TEST_API_KEY = 'toctou_admin_api_key_2026';

/**
 * Creates an isolated temp workspace + real WAL SQLite DB + full Gateway stack.
 */
async function createTestHarness(opts = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-l8-toctou-'));
  const dbPath = path.join(tmpDir, 'toctou_wal.sqlite');
  const sessionsDir = path.join(tmpDir, 'sessions');

  const lifecycle = new LifecycleManager({ registerSignals: false });
  const dbManager = new DatabaseManager({ dbPath });
  dbManager.open();
  dbManager.migrate();
  lifecycle.register('db', () => dbManager.close());

  const partnerRepository = new PartnerRepository(dbManager);
  const authRepository = new AuthRepository(dbManager);
  const customerRepository = new CustomerRepository(dbManager);
  const conversationRepository = new ConversationRepository(dbManager);
  const catalogRepository = new CatalogRepository(dbManager);
  const appointmentRepository = new AppointmentRepository(dbManager);
  const orderRepository = new OrderRepository(dbManager);
  const queueRepository = new QueueRepository(dbManager);

  const catalogService = new CatalogService({ dbManager, catalogRepository });
  const bookingService = new BookingService({
    dbManager,
    appointmentRepository,
    catalogRepository,
    partnerRepository,
  });
  const orderService = new OrderService({
    dbManager,
    orderRepository,
    catalogRepository,
  });
  const pdfService = new PdfService();

  const adapterStats = {
    connectCalls: 0,
    disconnectCalls: 0,
    resetCalls: 0,
    activeSockets: new Set(),
    sentMessages: [],
  };

  class RaceMockAdapter extends ChannelAdapter {
    constructor() {
      super();
      this._statuses = new Map();
    }
    async connect(sessionKey) {
      adapterStats.connectCalls += 1;
      await new Promise((r) => setTimeout(r, 8));
      adapterStats.activeSockets.add(sessionKey);
      this._statuses.set(sessionKey, 'CONNECTED');
    }
    async forceResetPairing(sessionKey) {
      adapterStats.resetCalls += 1;
      adapterStats.activeSockets.delete(sessionKey);
      this._statuses.set(sessionKey, 'DISCONNECTED');
      await new Promise((r) => setTimeout(r, 8));
      adapterStats.activeSockets.add(sessionKey);
      this._statuses.set(sessionKey, 'QR_REQUIRED');
    }
    async disconnect(sessionKey) {
      adapterStats.disconnectCalls += 1;
      await new Promise((r) => setTimeout(r, 5));
      adapterStats.activeSockets.delete(sessionKey);
      this._statuses.set(sessionKey, 'DISCONNECTED');
    }
    async getStatus(sessionKey) {
      return this._statuses.get(sessionKey) || 'DISCONNECTED';
    }
    async getQr() {
      return null;
    }
    async markRead() {
      // No-op in race mock
    }
    async sendPresence() {
      // No-op in race mock
    }
    async sendMessage(sessionKey, recipientId, payload) {
      await new Promise((r) => setTimeout(r, 4));
      adapterStats.sentMessages.push({
        sessionKey,
        recipientId,
        text: payload?.text || '',
        ts: Date.now(),
      });
      return { messageId: `msg_${adapterStats.sentMessages.length}` };
    }
    async close() {
      adapterStats.activeSockets.clear();
      this._statuses.clear();
    }
  }

  const channelAdapter = new RaceMockAdapter();
  const pauseController = new PauseController({ conversationRepository });
  const debouncer = new MessageDebouncer({
    debounceMs: opts.debounceMs ?? 25,
    maxWaitMs: opts.maxWaitMs ?? 120,
  });
  const outboxWorker = new OutboundQueueWorker({
    queueRepository,
    channelAdapter,
    minPresenceMs: 0,
    maxPresenceMs: 0,
    pollIntervalMs: 1000,
    maxConcurrentSessions: 10,
  });

  const sessionManager = new SessionManager({
    dbManager,
    sessionsDir,
    maxLinesPerPartner: opts.maxLinesPerPartner ?? 2,
    channelAdapter,
    pauseController,
    debouncer,
    outboxWorker,
    partnerRepository,
    customerRepository,
    conversationRepository,
    queueRepository,
    agentEngine: opts.agentEngine || null,
  });
  lifecycle.register('sessionManager', () => sessionManager.close());

  const gateway = new GatewayServer({
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
    sessionManager,
    pauseController,
    serveStaticUi: false,
  });

  // Override API key in authMiddleware for deterministic tests
  gateway.authMiddleware.apiKey = TEST_API_KEY;

  const { baseUrl } = await gateway.listen({ port: 0, host: '127.0.0.1' });
  lifecycle.register('gateway', () => gateway.close());

  async function api(method, pathname, { body, token, apiKey, headers = {} } = {}) {
    const reqHeaders = { ...headers };
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
    if (apiKey) reqHeaders['x-api-key'] = apiKey;
    if (body !== undefined) reqHeaders['Content-Type'] = 'application/json';
    const res = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: reqHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { status: res.status, json };
  }

  function createPartnerAndToken({ id, email, displayName }) {
    const partner = partnerRepository.create({
      id,
      email,
      passwordHash: hashPassword('SenhaForte!123'),
      displayName,
    });
    const { token, expiresAtMs } = gateway.authMiddleware.signJwt({
      partnerId: partner.id,
      email: partner.email,
    });
    authRepository.createSession({
      token,
      partnerId: partner.id,
      expiresAt: expiresAtMs,
    });
    return { partner, token };
  }

  async function cleanup() {
    await lifecycle.shutdown('TEST_DONE');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  return {
    tmpDir,
    dbPath,
    lifecycle,
    dbManager,
    partnerRepository,
    authRepository,
    customerRepository,
    conversationRepository,
    catalogRepository,
    appointmentRepository,
    orderRepository,
    queueRepository,
    catalogService,
    bookingService,
    orderService,
    channelAdapter,
    adapterStats,
    pauseController,
    debouncer,
    outboxWorker,
    sessionManager,
    gateway,
    baseUrl,
    api,
    createPartnerAndToken,
    cleanup,
  };
}

describe('Layer 8 — Auditoria Ofensiva TOCTOU & Race Conditions (WAL Real)', () => {
  it('1. TOCTOU de Sobreposição de Agenda por Duração: 20 disputas simultâneas sem overlap e zero 500/SQLITE_BUSY', async () => {
    const h = await createTestHarness();
    try {
      const { partner, token } = h.createPartnerAndToken({
        id: 'p_race_book',
        email: 'book@race.test',
        displayName: 'Barbearia Atômica',
      });

      const srv60 = h.catalogService.createItem(partner.id, {
        itemType: 'SERVICE',
        name: 'Combo Corte + Barba 60m',
        priceCents: 9000,
        durationMinutes: 60,
      });
      const srv30 = h.catalogService.createItem(partner.id, {
        itemType: 'SERVICE',
        name: 'Corte Rápido 30m',
        priceCents: 5000,
        durationMinutes: 30,
      });

      const dateStr = '2026-12-20';
      // 20 concurrent booking attempts competing across overlapping intervals:
      // 10:00 (60m -> [10:00, 11:00)) vs 10:15, 10:30, 10:45 (30m each)
      const candidates = [
        { itemId: srv60.id, timeSlot: '10:00' },
        { itemId: srv30.id, timeSlot: '10:15' },
        { itemId: srv30.id, timeSlot: '10:30' },
        { itemId: srv30.id, timeSlot: '10:45' },
      ];

      const requests = Array.from({ length: 20 }, (_, i) => {
        const pick = candidates[i % candidates.length];
        return h.api('POST', `/api/v1/partners/${partner.id}/appointments`, {
          token,
          body: {
            itemId: pick.itemId,
            dateStr,
            timeSlot: pick.timeSlot,
            clientName: `Cliente ${i + 1}`,
            confirmed: true,
          },
        });
      });

      const responses = await Promise.all(requests);

      // Zero 500 or unhandled SQLITE_BUSY
      const serverErrors = responses.filter((r) => r.status >= 500);
      assert.equal(serverErrors.length, 0, `Erros 500 inesperados: ${JSON.stringify(serverErrors)}`);

      const created = responses.filter((r) => r.status === 201);
      const conflicts = responses.filter((r) => r.status === 409 && r.json?.error?.code === 'SLOT_TAKEN');
      assert.ok(created.length >= 1, 'Ao menos 1 agendamento deve ser confirmado');
      assert.equal(created.length + conflicts.length, 20, 'Todas as 20 requisições devem resultar em 201 ou 409 SLOT_TAKEN');

      // Verify mathematically in SQLite that ZERO confirmed intervals overlap
      const persisted = h.appointmentRepository.listByPartnerAndDate(partner.id, dateStr, {
        status: 'CONFIRMED',
      });
      assert.equal(persisted.length, created.length);

      const intervals = persisted
        .map((ap) => {
          const start = slotToMinutes(ap.time_slot);
          const end = start + Number(ap.duration_minutes_snapshot);
          return { id: ap.id, start, end, slot: ap.time_slot, dur: ap.duration_minutes_snapshot };
        })
        .sort((a, b) => a.start - b.start);

      for (let i = 1; i < intervals.length; i += 1) {
        assert.ok(
          intervals[i].start >= intervals[i - 1].end,
          `Sobreposição ilegal detectada no SQLite: ${JSON.stringify(intervals[i - 1])} vs ${JSON.stringify(intervals[i])}`
        );
      }
    } finally {
      await h.cleanup();
    }
  });

  it('2. Race Condition de Estoque (Overselling Attack): stock=3 sob 25 pedidos simultâneos -> exatamente 3 aprovados, 22 bloqueados, stock final = 0', async () => {
    const h = await createTestHarness();
    try {
      const { partner, token } = h.createPartnerAndToken({
        id: 'p_race_stock',
        email: 'stock@race.test',
        displayName: 'Loja Estoque Blindado',
      });

      const limitedProduct = h.catalogService.createItem(partner.id, {
        itemType: 'PRODUCT',
        name: 'Edição Limitada VIP',
        priceCents: 12000,
        trackStock: true,
        stockQuantity: 3,
      });

      // 25 simultaneous HTTP order requests competing for 3 units
      const responses = await Promise.all(
        Array.from({ length: 25 }, (_, i) =>
          h.api('POST', `/api/v1/partners/${partner.id}/orders`, {
            token,
            body: {
              items: [{ itemId: limitedProduct.id, qty: 1 }],
              clientName: `Comprador ${i + 1}`,
              confirmed: true,
            },
          })
        )
      );

      const serverErrors = responses.filter((r) => r.status >= 500);
      assert.equal(serverErrors.length, 0, `Erros 500 inesperados: ${JSON.stringify(serverErrors)}`);

      const approved = responses.filter((r) => r.status === 201);
      const outOfStock = responses.filter(
        (r) => r.status === 409 && r.json?.error?.code === 'INSUFFICIENT_STOCK'
      );

      assert.equal(approved.length, 3, `Exatamente 3 pedidos devem vencer, obtido: ${approved.length}`);
      assert.equal(outOfStock.length, 22, `Exatamente 22 pedidos devem falhar com INSUFFICIENT_STOCK, obtido: ${outOfStock.length}`);

      const finalItem = h.catalogRepository.findById(limitedProduct.id, { partnerId: partner.id });
      assert.equal(Number(finalItem.stock_quantity), 0, 'Estoque final deve ser exatamente 0 (nunca negativo)');

      const persistedOrders = h.orderRepository.listByPartner(partner.id, { limit: 100 });
      assert.equal(persistedOrders.length, 3);
    } finally {
      await h.cleanup();
    }
  });

  it('3. TOCTOU de Mutação de Preço & Desativação de Catálogo em Voo: 0 pedidos com preço inconsistente ou após desativação', async () => {
    const h = await createTestHarness();
    try {
      const { partner, token } = h.createPartnerAndToken({
        id: 'p_race_price',
        email: 'price@race.test',
        displayName: 'Loja Preço Atômico',
      });

      const product = h.catalogService.createItem(partner.id, {
        itemType: 'PRODUCT',
        name: 'Camisa Premium',
        priceCents: 5000,
      });

      // Fire 20 orders in flight while admin mutates price 5000 -> 8000 and then deactivates item
      const makeOrderReq = (i) =>
        h.api('POST', `/api/v1/partners/${partner.id}/orders`, {
          token,
          body: {
            items: [
              {
                itemId: product.id,
                qty: 2,
                // Hostile external price attempt must ALWAYS be ignored
                priceCents: 100,
              },
            ],
            clientName: `Cliente Preço ${i + 1}`,
            confirmed: true,
          },
        });

      const wave1 = Promise.all(Array.from({ length: 7 }, (_, i) => makeOrderReq(i)));
      const priceUpdate = (async () => {
        await new Promise((r) => setTimeout(r, 8));
        return h.api('PUT', `/api/v1/partners/${partner.id}/catalog/${product.id}`, {
          token,
          body: { priceCents: 8000 },
        });
      })();
      const wave2 = (async () => {
        await new Promise((r) => setTimeout(r, 12));
        return Promise.all(Array.from({ length: 7 }, (_, i) => makeOrderReq(7 + i)));
      })();
      const deactivateOp = (async () => {
        await new Promise((r) => setTimeout(r, 25));
        return h.api('DELETE', `/api/v1/partners/${partner.id}/catalog/${product.id}`, {
          token,
        });
      })();
      const wave3 = (async () => {
        await new Promise((r) => setTimeout(r, 20));
        return Promise.all(Array.from({ length: 6 }, (_, i) => makeOrderReq(14 + i)));
      })();

      const [r1, rPrice, r2, rDeact, r3] = await Promise.all([
        wave1,
        priceUpdate,
        wave2,
        deactivateOp,
        wave3,
      ]);
      const allResults = [...r1, rPrice, ...r2, rDeact, ...r3];
      const serverErrors = allResults.filter((r) => r.status >= 500);
      assert.equal(serverErrors.length, 0);

      // Post-deactivation order MUST fail cleanly with 409 CATALOG_INACTIVE
      const afterDeactivate = await h.api('POST', `/api/v1/partners/${partner.id}/orders`, {
        token,
        body: {
          items: [{ itemId: product.id, qty: 1 }],
          clientName: 'Cliente Tardio',
          confirmed: true,
        },
      });
      assert.equal(afterDeactivate.status, 409);
      assert.equal(afterDeactivate.json?.error?.code, 'CATALOG_INACTIVE');

      // Every persisted order must have an atomic, valid snapshot price (5000 or 8000) and matching total_cents
      const orders = h.orderRepository.listByPartner(partner.id, { limit: 100 });
      assert.ok(orders.length >= 1, 'Ao menos 1 pedido deve ter sido gravado antes da desativação');
      for (const ord of orders) {
        assert.equal(ord.items.length, 1);
        const unit = Number(ord.items[0].price_cents);
        assert.ok(
          unit === 5000 || unit === 8000,
          `Preço unitário inconsistente encontrado: ${unit}`
        );
        assert.equal(Number(ord.total_cents), unit * 2);
      }
    } finally {
      await h.cleanup();
    }
  });

  it('4. Tempestade de Idempotência & Webhooks Duplicados: 25x X-Idempotency-Key e 25x mesmo event_id -> exatamente 1 registro / 1 processamento', async () => {
    let agentTurnCount = 0;
    const mockAgentEngine = {
      async processTurn({ message }) {
        agentTurnCount += 1;
        await new Promise((r) => setTimeout(r, 15));
        return { text: `Resposta única para: ${message}` };
      },
    };

    const h = await createTestHarness({ agentEngine: mockAgentEngine, debounceMs: 20 });
    try {
      const { partner, token } = h.createPartnerAndToken({
        id: 'p_race_idem',
        email: 'idem@race.test',
        displayName: 'Empresa Idempotente',
      });

      const prod = h.catalogService.createItem(partner.id, {
        itemType: 'PRODUCT',
        name: 'Café Especial',
        priceCents: 3500,
      });
      const srv = h.catalogService.createItem(partner.id, {
        itemType: 'SERVICE',
        name: 'Consultoria Express',
        priceCents: 15000,
        durationMinutes: 30,
      });

      // 25 concurrent POST /orders with the SAME X-Idempotency-Key
      const orderResponses = await Promise.all(
        Array.from({ length: 25 }, () =>
          h.api('POST', `/api/v1/partners/${partner.id}/orders`, {
            token,
            headers: { 'x-idempotency-key': 'idem-order-storm-001' },
            body: {
              items: [{ itemId: prod.id, qty: 1 }],
              clientName: 'Cliente Idempotente',
              confirmed: true,
            },
          })
        )
      );

      assert.equal(orderResponses.filter((r) => r.status >= 500).length, 0);
      assert.ok(orderResponses.every((r) => r.status === 200 || r.status === 201));
      const orderIds = new Set(orderResponses.map((r) => r.json?.data?.orderId));
      assert.equal(orderIds.size, 1, 'Todas as 25 respostas devem retornar o mesmo orderId');
      assert.equal(h.orderRepository.listByPartner(partner.id, { limit: 100 }).length, 1);

      // 25 concurrent POST /appointments with the SAME X-Idempotency-Key
      const apptResponses = await Promise.all(
        Array.from({ length: 25 }, () =>
          h.api('POST', `/api/v1/partners/${partner.id}/appointments`, {
            token,
            headers: { 'x-idempotency-key': 'idem-appt-storm-001' },
            body: {
              itemId: srv.id,
              dateStr: '2026-12-22',
              timeSlot: '15:00',
              clientName: 'Cliente Agenda Idempotente',
              confirmed: true,
            },
          })
        )
      );

      assert.equal(apptResponses.filter((r) => r.status >= 500).length, 0);
      assert.ok(apptResponses.every((r) => r.status === 200 || r.status === 201));
      const apptIds = new Set(apptResponses.map((r) => r.json?.data?.appointmentId));
      assert.equal(apptIds.size, 1, 'Todas as 25 respostas devem retornar o mesmo appointmentId');
      assert.equal(h.appointmentRepository.listByPartner(partner.id, { limit: 100 }).length, 1);

      // 25 simultaneous deliveries of the exact same inbound event_id into SessionManager
      const eventResults = await Promise.all(
        Array.from({ length: 25 }, () =>
          h.sessionManager.handleIncomingEvent({
            sessionKey: `pme:${partner.id}`,
            partnerId: partner.id,
            channel: 'whatsapp',
            chatId: '5511988887777@s.whatsapp.net',
            msgId: 'wamid_duplicate_storm_001',
            eventKey: `pme:${partner.id}:wamid_duplicate_storm_001`,
            pushName: 'Cliente Storm',
            text: 'Quero agendar',
          })
        )
      );

      assert.ok(eventResults.every((r) => r && r.ok === true));
      assert.equal(agentTurnCount, 1, 'Evento duplicado em rajada deve ser processado pelo AgentEngine exatamente 1 vez');
      assert.equal(h.queueRepository.countPendingOutbox(), 1, 'Exatamente 1 resposta deve ser enfileirada na outbox_queue');
    } finally {
      await h.cleanup();
    }
  });

  it('5. Race Condition de Limite de Linhas WhatsApp & Ciclo de Vida de Sessão: nunca excede MAX_LINES_PER_PARTNER=2 nem deixa órfãos', async () => {
    const h = await createTestHarness({ maxLinesPerPartner: 2 });
    try {
      const { partner, token } = h.createPartnerAndToken({
        id: 'p_race_lines',
        email: 'lines@race.test',
        displayName: 'Empresa Multi-Linha',
      });

      // 12 concurrent requests trying to create 12 distinct lines for a partner limited to 2
      const lineResponses = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          h.api('POST', '/api/v1/channels/sessions', {
            token,
            body: { partnerId: partner.id, lineId: `line_${i + 1}` },
          })
        )
      );

      const serverErrors = lineResponses.filter((r) => r.status >= 500);
      assert.equal(serverErrors.length, 0, `Erros 500 inesperados: ${JSON.stringify(serverErrors)}`);

      const createdLines = lineResponses.filter((r) => r.status === 201);
      const exceeded = lineResponses.filter(
        (r) => r.status === 409 && r.json?.error?.code === 'MAX_LINES_EXCEEDED'
      );

      assert.equal(createdLines.length, 2, `Exatamente 2 linhas devem ser criadas, obtido: ${createdLines.length}`);
      assert.equal(exceeded.length, 10, `Exatamente 10 requisições devem falhar com MAX_LINES_EXCEEDED`);
      assert.equal(h.sessionManager.listPartnerSessions(partner.id).length, 2);

      // Concurrent connect + forceResetPairing + disconnect on the same sessionKey
      const targetLine = h.sessionManager.listPartnerSessions(partner.id)[0];
      await Promise.all([
        h.sessionManager.connectSession(partner.id, targetLine.lineId),
        h.sessionManager.forceResetSession(partner.id, targetLine.lineId),
        h.sessionManager.disconnectSession(targetLine.sessionKey, { wipeAuth: true }),
        h.sessionManager.connectSession(partner.id, targetLine.lineId),
        h.sessionManager.disconnectSession(targetLine.sessionKey, { wipeAuth: false }),
      ]);

      // Final disconnect leaves zero orphan sockets and clean LifecycleManager shutdown
      for (const s of h.sessionManager.listPartnerSessions(partner.id)) {
        await h.sessionManager.disconnectSession(s.sessionKey);
      }
      assert.equal(h.adapterStats.activeSockets.size, 0, 'Nenhum socket órfão pode restar após disconnect');
    } finally {
      await h.cleanup();
    }
  });

  it('6. Corrida na Fila de Saída (OutboundQueueWorker Double-Send Attack): 30 msgs sob 5 chamadas/workers concorrentes -> exatamente 1 envio por msg', async () => {
    const h = await createTestHarness();
    try {
      const { partner } = h.createPartnerAndToken({
        id: 'p_race_outbox',
        email: 'outbox@race.test',
        displayName: 'Empresa Outbox Atômica',
      });

      // Enqueue 30 messages across 5 sessions
      const expectedTexts = new Set();
      for (let i = 1; i <= 30; i += 1) {
        const text = `Mensagem Única #${i}`;
        expectedTexts.add(text);
        h.queueRepository.enqueueOutbox({
          sessionKey: `pme:${partner.id}:s${(i % 5) + 1}`,
          channel: 'whatsapp',
          recipientId: `551190000${String(i).padStart(4, '0')}@s.whatsapp.net`,
          payload: { type: 'text', text },
          nextAttemptAt: Date.now() - 1000,
        });
      }

      // Spin up 5 separate OutboundQueueWorker instances pointing to the SAME SQLite WAL DB
      // + fire concurrent processOnce() calls across all of them simultaneously
      const workers = Array.from({ length: 5 }, () =>
        new OutboundQueueWorker({
          queueRepository: h.queueRepository,
          channelAdapter: h.channelAdapter,
          minPresenceMs: 0,
          maxPresenceMs: 0,
          maxConcurrentSessions: 10,
        })
      );

      await Promise.all([
        ...workers.map((w) => w.processOnce({ limit: 50 })),
        h.outboxWorker.processOnce({ limit: 50 }),
      ]);

      // Every single message must have been sent EXACTLY ONCE (zero duplicates)
      assert.equal(
        h.adapterStats.sentMessages.length,
        30,
        `Esperado exatamente 30 envios, obtido: ${h.adapterStats.sentMessages.length}`
      );
      const sentTexts = new Set(h.adapterStats.sentMessages.map((m) => m.text));
      assert.equal(sentTexts.size, 30, 'Cada uma das 30 mensagens deve ser única (zero duplicação)');
      for (const expected of expectedTexts) {
        assert.ok(sentTexts.has(expected), `Mensagem ausente: ${expected}`);
      }
      assert.equal(h.queueRepository.countPendingOutbox(), 0);

      for (const w of workers) {
        await w.stop();
      }
    } finally {
      await h.cleanup();
    }
  });

  it('7. Corrida de Cadastro Duplicado (15x POST /auth/register -> 1x 201, 14x 409) & Soft-Pause sob Rajada sem perda nem vazamento de resposta', async () => {
    let aiRepliesGenerated = 0;
    const slowAgentEngine = {
      async processTurn({ message }) {
        // Simulate LLM latency during which operator toggles soft-pause
        await new Promise((r) => setTimeout(r, 35));
        aiRepliesGenerated += 1;
        return { text: `IA respondeu: ${message}` };
      },
    };

    const h = await createTestHarness({ agentEngine: slowAgentEngine, debounceMs: 25 });
    try {
      // Part A: 15 concurrent POST /api/v1/auth/register with identical email
      const dupEmail = 'corrida.duplicada@autonmax.test';
      const registerResponses = await Promise.all(
        Array.from({ length: 15 }, (_, i) =>
          h.api('POST', '/api/v1/auth/register', {
            body: {
              email: dupEmail,
              password: 'Password123!',
              displayName: `Tentativa ${i + 1}`,
            },
          })
        )
      );

      assert.equal(registerResponses.filter((r) => r.status >= 500).length, 0, 'Zero erro 500 permitido');
      const ok201 = registerResponses.filter((r) => r.status === 201);
      const conflict409 = registerResponses.filter(
        (r) => r.status === 409 && r.json?.error?.code === 'EMAIL_ALREADY_EXISTS'
      );
      assert.equal(ok201.length, 1, `Exatamente 1 cadastro deve vencer (201), obtido: ${ok201.length}`);
      assert.equal(conflict409.length, 14, `Exatamente 14 cadastros devem retornar 409, obtido: ${conflict409.length}`);

      const partnerId = ok201[0].json.data.partner.id;
      const chatId = '5511977776666@s.whatsapp.net';

      // Create conversation so we can toggle pause while messages arrive
      const customer = h.customerRepository.upsert({
        partnerId,
        channel: 'whatsapp',
        externalId: chatId,
        name: 'Cliente SoftPause',
      });
      const conv = h.conversationRepository.upsertConversation({
        partnerId,
        customerId: customer.id,
        channel: 'whatsapp',
        externalChatId: chatId,
      });

      // Part B1: Message enters debouncer while unpaused, operator pauses BEFORE LLM commits -> ZERO outbox reply leaked
      const inFlightMsg = h.sessionManager.handleIncomingEvent({
        sessionKey: `pme:${partnerId}`,
        partnerId,
        channel: 'whatsapp',
        chatId,
        msgId: 'sp_inflight_1',
        eventKey: `pme:${partnerId}:sp_inflight_1`,
        text: 'Mensagem antes do pause imediato',
      });

      // Pause conversation while message is inside debouncer / LLM window
      await new Promise((r) => setTimeout(r, 10));
      h.pauseController.pause({ partnerId, conversationId: conv.id, humanRequested: true });

      const inFlightRes = await inFlightMsg;
      assert.equal(inFlightRes.paused, true, 'Resposta deve ser suprimida ao detectar pause durante debounce/LLM');
      assert.equal(h.queueRepository.countPendingOutbox(), 0, 'ZERO mensagens podem vazar para outbox_queue enquanto pausado');

      // Part B2: 10 concurrent inbound messages while paused -> ZERO lost in paused_context_json & ZERO outbox replies
      const pausedBatch = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          h.sessionManager.handleIncomingEvent({
            sessionKey: `pme:${partnerId}`,
            partnerId,
            channel: 'whatsapp',
            chatId,
            msgId: `sp_burst_${i + 1}`,
            eventKey: `pme:${partnerId}:sp_burst_${i + 1}`,
            text: `Msg pausada #${i + 1}`,
          })
        )
      );

      assert.ok(pausedBatch.every((r) => r.ok === true && r.paused === true));
      assert.equal(h.queueRepository.countPendingOutbox(), 0, 'Nenhuma resposta de IA pode vazar enquanto pausado');

      const reloadedConv = h.conversationRepository.findById(conv.id, { partnerId });
      assert.equal(Number(reloadedConv.is_paused), 1, 'Estado is_paused não pode ser sobrescrito por corrida');
      const recordedTexts = reloadedConv.paused_context.map((e) => e.text);
      for (let i = 1; i <= 10; i += 1) {
        assert.ok(
          recordedTexts.includes(`Msg pausada #${i}`),
          `Mensagem pausada #${i} perdida em paused_context_json!`
        );
      }
      assert.ok(
        recordedTexts.includes('Mensagem antes do pause imediato'),
        'Mensagem interceptada na transição de pause deve ser preservada em paused_context_json'
      );
      assert.equal(aiRepliesGenerated, 0, 'AgentEngine não deve gerar resposta quando pausado antes do flush');
    } finally {
      await h.cleanup();
    }
  });
});
