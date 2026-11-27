'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { DatabaseManager } = require('../core/storage/DatabaseManager');
const { PartnerRepository } = require('../core/storage/repositories/PartnerRepository');
const { AuthRepository } = require('../core/storage/repositories/AuthRepository');
const { CatalogRepository } = require('../core/storage/repositories/CatalogRepository');
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
const { PersonaCompilerService } = require('../core/ai/PersonaCompilerService');

const { ChannelAdapter } = require('../core/messaging/ChannelAdapter');
const { SessionManager } = require('../core/messaging/SessionManager');
const { MessageDebouncer } = require('../core/messaging/MessageDebouncer');
const { OutboundQueueWorker } = require('../core/messaging/OutboundQueueWorker');
const { PauseController } = require('../core/messaging/PauseController');

const { GatewayServer } = require('../core/gateway/Server');
const { AuthMiddleware } = require('../core/gateway/middlewares/AuthMiddleware');
const { CorsMiddleware } = require('../core/gateway/middlewares/CorsMiddleware');
const { SseManager } = require('../core/gateway/events/SseManager');
const { WebhookDispatcher } = require('../core/gateway/events/WebhookDispatcher');
const { LifecycleManager } = require('../core/lifecycle/LifecycleManager');

const SEGMENTS = [
  'Barbearia',
  'Oficina Mecânica',
  'Clínica Odontológica',
  'Lanchonete',
  'Pet Shop',
];

function bytesToMb(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const idx = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1)
  );
  return Number(sortedValues[idx].toFixed(2));
}

class StressChannelAdapter extends ChannelAdapter {
  constructor(options = {}) {
    super();
    this.failingSessions = new Set(options.failingSessions || []);
    this.delayBySession = options.delayBySession || new Map();
    this.sent = [];
    this.statuses = new Map();
  }

  async connect(sessionKey) {
    this.statuses.set(sessionKey, 'CONNECTED');
  }

  async disconnect(sessionKey) {
    this.statuses.set(sessionKey, 'DISCONNECTED');
  }

  async getStatus(sessionKey) {
    return this.statuses.get(sessionKey) || 'CONNECTED';
  }

  async getQr() {
    return null;
  }

  async sendPresence() {}
  async markRead() {}

  async sendMessage(sessionKey, recipientId, payload) {
    const delayMs = this.delayBySession.get(sessionKey) || 0;
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    if (this.failingSessions.has(sessionKey)) {
      throw new Error(`ADAPTER_SEND_FAILED:${sessionKey}`);
    }
    const rec = { sessionKey, recipientId, text: payload.text, ts: Date.now() };
    this.sent.push(rec);
    return { messageId: `stress_msg_${this.sent.length}`, timestamp: new Date().toISOString() };
  }
}

function createDiskFixture(label) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `autonmax-l7-${label}-`));
  const dbPath = path.join(tmpDir, 'stress_wal.db');
  const sessionsDir = path.join(tmpDir, 'sessions');

  const lifecycle = new LifecycleManager({ drainTimeoutMs: 5000 });
  const dbManager = new DatabaseManager({ dbPath });
  dbManager.init();
  lifecycle.register('sqlite-db', () => dbManager.close());

  const partnerRepository = new PartnerRepository(dbManager);
  const authRepository = new AuthRepository(dbManager);
  const catalogRepository = new CatalogRepository(dbManager);
  const customerRepository = new CustomerRepository(dbManager);
  const conversationRepository = new ConversationRepository(dbManager);
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
  const orderService = new OrderService({ dbManager, orderRepository, catalogRepository });
  const customerService = new CustomerService({ dbManager, customerRepository });
  const pdfService = new PdfService();
  const promptPin = new PromptPin();
  promptPin.verifyAtBoot({ strict: true });

  return {
    tmpDir,
    dbPath,
    sessionsDir,
    lifecycle,
    dbManager,
    partnerRepository,
    authRepository,
    catalogRepository,
    customerRepository,
    conversationRepository,
    appointmentRepository,
    orderRepository,
    queueRepository,
    catalogService,
    bookingService,
    orderService,
    customerService,
    pdfService,
    promptPin,
    async cleanup() {
      const res = await lifecycle.shutdown(`l7-${label}-cleanup`);
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return res;
    },
  };
}

describe('Layer 7 — Estresse Multi-Tenant, Concorrência Extrema & Benchmark (512 MB RAM)', () => {
  test('1. Tempestade Multi-Tenant de WhatsApp (20 Tenants x 15 Clientes = 300 Conversas / 900 Mensagens em Rajada) + Benchmark 512 MB', async () => {
    const fx = createDiskFixture('storm');
    const adapter = new StressChannelAdapter();
    const compiler = new PersonaCompilerService({ llmRouter: null });

    const TENANT_COUNT = 20;
    const CLIENTS_PER_TENANT = 15;
    const FRAGMENTS_PER_CLIENT = 3; // 20 * 15 * 3 = 900 inbound messages
    const SHARED_CLIENT_COUNT = 10; // Same 10 WhatsApp numbers across first 5 tenants

    const tenants = [];
    const crossTenantLeaks = [];
    const turnLatenciesMs = [];
    let sqliteBusyErrors = 0;

    // Seed 20 distinct tenants with unique 3-layer compiled prompts & distinct catalog items/prices
    for (let t = 0; t < TENANT_COUNT; t += 1) {
      const segment = SEGMENTS[t % SEGMENTS.length];
      const partnerId = `tenant_${String(t + 1).padStart(2, '0')}`;
      const displayName = `Empresa_${String(t + 1).padStart(2, '0')}_${segment}`;
      const compiled = await compiler.generateSpecializedPersona({
        businessName: displayName,
        segment,
        differentiators: `Diferencial exclusivo #${t + 1} da ${displayName}`,
      });

      fx.partnerRepository.create({
        id: partnerId,
        email: `${partnerId}@autonmax.stress`,
        displayName,
        storeSegment: segment,
        personalityPrompt: compiled.compiledPrompt,
      });

      const svcPrice = 5000 + t * 250;
      const prdPrice = 3000 + t * 150;
      const svc = fx.catalogService.createItem(partnerId, {
        id: `svc_${partnerId}`,
        type: 'SERVICE',
        name: `Servico_${partnerId}`,
        description: `Atendimento oficial de ${displayName}`,
        priceCents: svcPrice,
        durationMinutes: 30,
      });
      const prd = fx.catalogService.createItem(partnerId, {
        id: `prd_${partnerId}`,
        type: 'PRODUCT',
        name: `Produto_${partnerId}`,
        description: `Produto oficial de ${displayName}`,
        priceCents: prdPrice,
      });

      tenants.push({ partnerId, displayName, segment, svc, prd, svcPrice, prdPrice });
    }

    // Tenant-aware mock LlmRouter that verifies ZERO cross-tenant prompt/catalog contamination
    const stressLlmRouter = {
      circuitBreaker: {},
      async generate({ systemPrompt, messages }) {
        const match = systemPrompt.match(/Nome:\s*(Empresa_\d{2}_[^\n(]+)/);
        const ownerName = match ? match[1].trim() : 'UNKNOWN';
        const ownerIdxMatch = ownerName.match(/Empresa_(\d{2})_/);
        const expectedTenantTag = ownerIdxMatch ? `tenant_${ownerIdxMatch[1]}` : '';

        // Verify no other tenant's catalog item ID leaked into systemPrompt
        const leakedIds = (systemPrompt.match(/(?:svc|prd)_tenant_\d{2}/g) || []).filter(
          (id) => !id.endsWith(expectedTenantTag)
        );
        if (leakedIds.length > 0) {
          crossTenantLeaks.push({ ownerName, leakedIds });
        }

        const lastUser = messages[messages.length - 1]?.content || '';
        return {
          ok: true,
          status: 'SUCCESS',
          providerUsed: 'mock_stress',
          model: 'stress-1',
          text: `[${expectedTenantTag}] Olá! Bem-vindo à ${ownerName}. Recebemos: ${lastUser.slice(0, 40)}`,
          toolCalls: [],
        };
      },
    };

    const agentEngine = new AgentEngine({
      dbManager: fx.dbManager,
      llmRouter: stressLlmRouter,
      promptPin: fx.promptPin,
      catalogService: fx.catalogService,
      bookingService: fx.bookingService,
      orderService: fx.orderService,
      customerService: fx.customerService,
      partnerRepository: fx.partnerRepository,
      conversationRepository: fx.conversationRepository,
      appointmentRepository: fx.appointmentRepository,
      orderRepository: fx.orderRepository,
    });

    const debouncer = new MessageDebouncer({ windowMs: 25 });
    const outboxWorker = new OutboundQueueWorker({
      queueRepository: fx.queueRepository,
      channelAdapter: adapter,
      minPresenceMs: 0,
      maxPresenceMs: 0,
      maxConcurrentSessions: 10,
    });
    const pauseController = new PauseController({
      conversationRepository: fx.conversationRepository,
    });
    const sessionManager = new SessionManager({
      dbManager: fx.dbManager,
      sessionsDir: fx.sessionsDir,
      channelAdapter: adapter,
      agentEngine,
      pauseController,
      debouncer,
      outboxWorker,
      partnerRepository: fx.partnerRepository,
      customerRepository: fx.customerRepository,
      conversationRepository: fx.conversationRepository,
      queueRepository: fx.queueRepository,
    });
    fx.lifecycle.register('messaging-sessions', () => sessionManager.close());

    const memBefore = process.memoryUsage();
    let peakRss = memBefore.rss;
    let peakHeap = memBefore.heapUsed;
    const tStart = performance.now();

    try {
      // Connect all 20 tenant sessions
      for (const t of tenants) {
        await sessionManager.connectSession(t.partnerId, 'default');
      }

      // Launch 900 inbound WhatsApp messages across 300 conversations in concurrent bursts
      const inboundPromises = [];
      for (let tIdx = 0; tIdx < tenants.length; tIdx += 1) {
        const tenant = tenants[tIdx];
        const sessionKey = `pme:${tenant.partnerId}`;
        for (let c = 0; c < CLIENTS_PER_TENANT; c += 1) {
          // First 5 tenants share the exact same 10 end-customer WhatsApp numbers
          const chatId =
            tIdx < 5 && c < SHARED_CLIENT_COUNT
              ? `5533999900${String(c + 1).padStart(2, '0')}@s.whatsapp.net`
              : `553388${String(tIdx).padStart(2, '0')}${String(c).padStart(3, '0')}@s.whatsapp.net`;

          for (let f = 0; f < FRAGMENTS_PER_CLIENT; f += 1) {
            const msgId = `m_${tenant.partnerId}_c${c}_f${f}`;
            const turnStart = performance.now();
            const p = sessionManager
              .handleIncomingEvent({
                eventKey: `${sessionKey}:${msgId}`,
                msgId,
                sessionKey,
                partnerId: tenant.partnerId,
                channel: 'whatsapp',
                chatId,
                pushName: `Cliente_${c}`,
                text: `Msg ${f + 1} para ${tenant.partnerId} (${tenant.segment})`,
              })
              .then((res) => {
                if (f === FRAGMENTS_PER_CLIENT - 1) {
                  turnLatenciesMs.push(performance.now() - turnStart);
                }
                return res;
              })
              .catch((err) => {
                if (/SQLITE_BUSY|database is locked/i.test(String(err?.message || ''))) {
                  sqliteBusyErrors += 1;
                }
                throw err;
              });
            inboundPromises.push(p);
          }
        }
      }

      const results = await Promise.all(inboundPromises);
      const memMid = process.memoryUsage();
      peakRss = Math.max(peakRss, memMid.rss);
      peakHeap = Math.max(peakHeap, memMid.heapUsed);

      assert.equal(results.length, TENANT_COUNT * CLIENTS_PER_TENANT * FRAGMENTS_PER_CLIENT);
      assert.equal(crossTenantLeaks.length, 0, `Detected cross-tenant leaks: ${JSON.stringify(crossTenantLeaks)}`);
      assert.equal(sqliteBusyErrors, 0, 'Expected zero unhandled SQLITE_BUSY errors');

      // Drain all 300 consolidated replies through OutboundQueueWorker
      while (fx.queueRepository.countPendingOutbox() > 0) {
        await outboxWorker.processOnce({ limit: 100 });
      }

      const elapsedMs = performance.now() - tStart;
      const memAfter = process.memoryUsage();
      peakRss = Math.max(peakRss, memAfter.rss);
      peakHeap = Math.max(peakHeap, memAfter.heapUsed);

      // Verify 300 consolidated conversations answered (1 per client per tenant)
      assert.equal(adapter.sent.length, TENANT_COUNT * CLIENTS_PER_TENANT);

      // Verify every sent reply matches its own tenant tag (zero cross-tenant mixup)
      for (const s of adapter.sent) {
        const expectedPartner = s.sessionKey.replace(/^pme:/, '');
        assert.ok(
          s.text.startsWith(`[${expectedPartner}]`),
          `Cross-tenant reply mismatch: session=${s.sessionKey} text=${s.text}`
        );
      }

      // Verify shared WhatsApp numbers exist independently in each of the 5 tenants with isolated history
      for (let c = 0; c < SHARED_CLIENT_COUNT; c += 1) {
        const sharedJid = `5533999900${String(c + 1).padStart(2, '0')}@s.whatsapp.net`;
        for (let tIdx = 0; tIdx < 5; tIdx += 1) {
          const tenant = tenants[tIdx];
          const conv = fx.conversationRepository.findByExternalChat(
            tenant.partnerId,
            'whatsapp',
            sharedJid
          );
          assert.ok(conv, `Missing conversation for ${sharedJid} in ${tenant.partnerId}`);
          const msgs = fx.conversationRepository.listMessages(conv.id, {
            partnerId: tenant.partnerId,
          });
          assert.equal(msgs.length, 2, 'Expected 1 consolidated INBOUND + 1 OUTBOUND');
          assert.match(msgs[0].content, new RegExp(tenant.partnerId));
          assert.match(msgs[1].content, new RegExp(`\\[${tenant.partnerId}\\]`));
        }
      }

      // Verify duplicate replay is blocked by processed_events
      const dupCheck = await sessionManager.handleIncomingEvent({
        eventKey: 'pme:tenant_01:m_tenant_01_c0_f0',
        msgId: 'm_tenant_01_c0_f0',
        sessionKey: 'pme:tenant_01',
        partnerId: 'tenant_01',
        channel: 'whatsapp',
        chatId: '553399990001@s.whatsapp.net',
        text: 'Duplicate replay',
      });
      assert.equal(dupCheck.duplicate, true);

      // Compute and print Benchmark SLA metrics
      turnLatenciesMs.sort((a, b) => a - b);
      const avgLatencyMs = Number(
        (turnLatenciesMs.reduce((s, v) => s + v, 0) / turnLatenciesMs.length).toFixed(2)
      );
      const p95LatencyMs = percentile(turnLatenciesMs, 95);
      const totalMessages = TENANT_COUNT * CLIENTS_PER_TENANT * FRAGMENTS_PER_CLIENT;
      const throughputMsgSec = Number(((totalMessages / elapsedMs) * 1000).toFixed(1));
      const rssBeforeMb = bytesToMb(memBefore.rss);
      const rssPeakMb = bytesToMb(peakRss);
      const heapBeforeMb = bytesToMb(memBefore.heapUsed);
      const heapPeakMb = bytesToMb(peakHeap);
      const heapDeltaMb = Number((heapPeakMb - heapBeforeMb).toFixed(2));

      console.log(
        `[BENCHMARK_L7] tenants=${TENANT_COUNT} convs=${TENANT_COUNT * CLIENTS_PER_TENANT} msgs=${totalMessages} ` +
          `elapsedMs=${elapsedMs.toFixed(1)} throughput=${throughputMsgSec}msg/s ` +
          `avgTurnMs=${avgLatencyMs} p95TurnMs=${p95LatencyMs} ` +
          `rssBeforeMB=${rssBeforeMb} rssPeakMB=${rssPeakMb} ` +
          `heapBeforeMB=${heapBeforeMb} heapPeakMB=${heapPeakMb} heapDeltaMB=${heapDeltaMb} ` +
          `sqliteBusy=${sqliteBusyErrors} leaks=${crossTenantLeaks.length}`
      );

      // SLA Assertions for 512 MB RAM container
      assert.ok(rssPeakMb < 512, `RSS peak (${rssPeakMb} MB) exceeded 512 MB container budget`);
      assert.ok(heapDeltaMb < 180, `Heap delta (${heapDeltaMb} MB) too high during 900-msg storm`);
      assert.ok(p95LatencyMs < 10000, `p95 turn latency (${p95LatencyMs} ms) exceeded SLA`);
    } finally {
      const shutdownRes = await fx.cleanup();
      assert.equal(shutdownRes.ok, true);
      assert.equal(fx.dbManager.isOpen(), false);
    }
  });

  test('2. Concorrência Extrema de Agenda & Pedidos (15 Inter-Tenant OK, 15 Intra-Tenant 1 vencedor / 14 SLOT_TAKEN, 20 Pedidos Paralelos)', async () => {
    const fx = createDiskFixture('concurrency');
    let sqliteBusyErrors = 0;

    try {
      const tenants = [];
      for (let i = 1; i <= 20; i += 1) {
        const pid = `conc_t${String(i).padStart(2, '0')}`;
        fx.partnerRepository.create({
          id: pid,
          email: `${pid}@autonmax.stress`,
          displayName: `Loja ${i}`,
        });
        const svc = fx.catalogService.createItem(pid, {
          id: `svc_${pid}`,
          type: 'SERVICE',
          name: `Serviço ${i}`,
          priceCents: 4000 + i * 100,
          durationMinutes: 30,
        });
        const prd = fx.catalogService.createItem(pid, {
          id: `prd_${pid}`,
          type: 'PRODUCT',
          name: `Produto ${i}`,
          priceCents: 2000 + i * 50,
        });
        tenants.push({ pid, svc, prd });
      }

      // 2a. Inter-Tenant: 15 different tenants book exact same slot 2026-12-15 10:00 -> 15/15 succeed
      const interResults = await Promise.all(
        tenants.slice(0, 15).map((t, idx) =>
          Promise.resolve().then(() => {
            try {
              return fx.bookingService.bookService({
                partnerId: t.pid,
                itemId: t.svc.id,
                dateStr: '2026-12-15',
                timeSlot: '10:00',
                clientName: `Cliente Inter ${idx + 1}`,
                confirmed: true,
              });
            } catch (err) {
              if (/SQLITE_BUSY|database is locked/i.test(String(err?.message || ''))) {
                sqliteBusyErrors += 1;
              }
              throw err;
            }
          })
        )
      );
      assert.equal(interResults.length, 15);
      assert.ok(interResults.every((r) => r.appointment.status === 'CONFIRMED'));

      // 2b. Intra-Tenant: 15 clients race for exact same slot 2026-12-15 14:00 in tenant 1 -> 1 wins, 14 SLOT_TAKEN
      const targetTenant = tenants[0];
      const intraOutcomes = await Promise.allSettled(
        Array.from({ length: 15 }, (_, idx) =>
          Promise.resolve().then(() =>
            fx.bookingService.bookService({
              partnerId: targetTenant.pid,
              itemId: targetTenant.svc.id,
              dateStr: '2026-12-15',
              timeSlot: '14:00',
              clientName: `Disputa ${idx + 1}`,
              confirmed: true,
            })
          )
        )
      );

      const winners = intraOutcomes.filter((o) => o.status === 'fulfilled');
      const losers = intraOutcomes.filter((o) => o.status === 'rejected');
      assert.equal(winners.length, 1, `Expected exactly 1 winner, got ${winners.length}`);
      assert.equal(losers.length, 14, `Expected 14 losers, got ${losers.length}`);
      for (const l of losers) {
        assert.equal(l.reason?.code, 'SLOT_TAKEN', `Unexpected error: ${l.reason?.message}`);
      }
      const dbConfirmedAt14 = fx.appointmentRepository
        .listByPartnerAndDate(targetTenant.pid, '2026-12-15', { status: 'CONFIRMED' })
        .filter((a) => a.time_slot === '14:00');
      assert.equal(dbConfirmedAt14.length, 1);

      // 2c. Parallel Orders across 20 tenants with authoritative SQLite prices (ignoring forged external prices)
      const orderResults = await Promise.all(
        tenants.map((t, idx) =>
          Promise.resolve().then(() => {
            const qty = (idx % 3) + 1;
            const res = fx.orderService.createOrder({
              partnerId: t.pid,
              clientName: `Comprador ${idx + 1}`,
              items: [{ itemId: t.prd.id, qty, priceCents: 1 }], // forged 1 cent must be ignored
              confirmed: true,
            });
            return { res, expectedTotal: t.prd.price_cents * qty };
          })
        )
      );
      assert.equal(orderResults.length, 20);
      for (const { res, expectedTotal } of orderResults) {
        assert.equal(res.order.total_cents, expectedTotal);
      }
      assert.equal(sqliteBusyErrors, 0);
    } finally {
      const shutdownRes = await fx.cleanup();
      assert.equal(shutdownRes.ok, true);
    }
  });

  test('3. Auditoria Hostil de Vazamento Cross-Tenant (REST + Repositórios: 100% 403/404 sem mutação ou vazamento)', async () => {
    const fx = createDiskFixture('hostile');
    const adapter = new StressChannelAdapter();
    const pauseController = new PauseController({
      conversationRepository: fx.conversationRepository,
    });
    const debouncer = new MessageDebouncer({ windowMs: 10 });
    const outboxWorker = new OutboundQueueWorker({
      queueRepository: fx.queueRepository,
      channelAdapter: adapter,
      minPresenceMs: 0,
      maxPresenceMs: 0,
    });
    const sessionManager = new SessionManager({
      dbManager: fx.dbManager,
      sessionsDir: fx.sessionsDir,
      channelAdapter: adapter,
      pauseController,
      debouncer,
      outboxWorker,
      partnerRepository: fx.partnerRepository,
      customerRepository: fx.customerRepository,
      conversationRepository: fx.conversationRepository,
      queueRepository: fx.queueRepository,
    });
    fx.lifecycle.register('messaging-sessions', () => sessionManager.close());

    const capturedAiSystemPrompts = [];
    const mockRouter = {
      circuitBreaker: {},
      async generate({ systemPrompt }) {
        capturedAiSystemPrompts.push(systemPrompt);
        return {
          ok: true,
          status: 'SUCCESS',
          providerUsed: 'mock',
          model: 'm1',
          text: 'OK',
          toolCalls: [],
        };
      },
    };
    const agentEngine = new AgentEngine({
      dbManager: fx.dbManager,
      llmRouter: mockRouter,
      promptPin: fx.promptPin,
      catalogService: fx.catalogService,
      bookingService: fx.bookingService,
      orderService: fx.orderService,
      customerService: fx.customerService,
      partnerRepository: fx.partnerRepository,
      conversationRepository: fx.conversationRepository,
      appointmentRepository: fx.appointmentRepository,
      orderRepository: fx.orderRepository,
    });

    const authMiddleware = new AuthMiddleware({
      jwtSecret: 'hostile-test-jwt-secret-key-32-bytes',
      internalApiKey: 'hostile-internal-api-key',
      authRepository: fx.authRepository,
    });
    const server = new GatewayServer({
      dbManager: fx.dbManager,
      partnerRepository: fx.partnerRepository,
      authRepository: fx.authRepository,
      catalogRepository: fx.catalogRepository,
      conversationRepository: fx.conversationRepository,
      appointmentRepository: fx.appointmentRepository,
      queueRepository: fx.queueRepository,
      catalogService: fx.catalogService,
      bookingService: fx.bookingService,
      orderService: fx.orderService,
      pdfService: fx.pdfService,
      promptPin: fx.promptPin,
      llmRouter: mockRouter,
      agentEngine,
      sessionManager,
      pauseController,
      corsMiddleware: new CorsMiddleware({ allowedOrigins: ['http://localhost:3000'] }),
      authMiddleware,
      sseManager: new SseManager({ heartbeatMs: 0 }),
      webhookDispatcher: new WebhookDispatcher({
        signingSecret: 'hostile-webhook-secret-32-bytes',
        partnerRepository: fx.partnerRepository,
      }),
    });
    fx.lifecycle.register('http-gateway', () => server.close());

    const { baseUrl } = await server.listen({ port: 0, host: '127.0.0.1' });

    try {
      // Register Tenant A and Tenant B
      const regA = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'tenant-A',
          email: 'a@hostile.test',
          password: 'Password@123',
          displayName: 'Empresa Alpha',
        }),
      });
      const tokenA = (await regA.json()).data.token;

      const regB = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'tenant-B',
          email: 'b@hostile.test',
          password: 'Password@123',
          displayName: 'Empresa Beta SECRETA',
        }),
      });
      const tokenB = (await regB.json()).data.token;

      // Seed Tenant B resources
      const svcB = fx.catalogService.createItem('tenant-B', {
        id: 'svc-B-secret',
        type: 'SERVICE',
        name: 'Serviço Confidencial B',
        priceCents: 99000,
        durationMinutes: 60,
      });
      const prdB = fx.catalogService.createItem('tenant-B', {
        id: 'prd-B-secret',
        type: 'PRODUCT',
        name: 'Produto Confidencial B',
        priceCents: 88000,
      });
      const apptB = fx.bookingService.bookService({
        partnerId: 'tenant-B',
        itemId: svcB.id,
        dateStr: '2026-12-20',
        timeSlot: '11:00',
        clientName: 'Cliente Secreto B',
        confirmed: true,
      }).appointment;
      const orderB = fx.orderService.createOrder({
        partnerId: 'tenant-B',
        clientName: 'Comprador Secreto B',
        items: [{ itemId: prdB.id, qty: 1 }],
        confirmed: true,
      }).order;
      const custB = fx.customerRepository.upsert({
        partnerId: 'tenant-B',
        channel: 'whatsapp',
        externalId: '5511999998888@s.whatsapp.net',
        name: 'Cliente Secreto B',
      });
      const convB = fx.conversationRepository.upsertConversation({
        partnerId: 'tenant-B',
        customerId: custB.id,
        channel: 'whatsapp',
        externalChatId: '5511999998888@s.whatsapp.net',
      });
      fx.conversationRepository.addMessage({
        conversationId: convB.id,
        partnerId: 'tenant-B',
        direction: 'INBOUND',
        role: 'user',
        content: 'Segredo comercial do Tenant B',
      });
      await sessionManager.connectSession('tenant-B', 'default');

      const authA = { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' };

      // 3a. Direct cross-tenant URL attacks (Tenant A token -> /partners/tenant-B/* & /channels/sessions/pme:tenant-B/*) -> 403
      const forbiddenRequests = [
        ['GET', '/api/v1/partners/tenant-B/config'],
        ['PUT', '/api/v1/partners/tenant-B/config', { displayName: 'Hacked' }],
        ['POST', '/api/v1/partners/tenant-B/specialize-prompt', { businessName: 'X', segment: 'Y' }],
        ['GET', '/api/v1/partners/tenant-B/catalog'],
        ['PUT', `/api/v1/partners/tenant-B/catalog/${svcB.id}`, { name: 'Hacked' }],
        ['DELETE', `/api/v1/partners/tenant-B/catalog/${svcB.id}`],
        ['GET', '/api/v1/partners/tenant-B/appointments'],
        ['GET', '/api/v1/partners/tenant-B/appointments/pdf?date=2026-12-20'],
        ['POST', `/api/v1/partners/tenant-B/appointments/${apptB.id}/cancel`, {}],
        ['GET', '/api/v1/partners/tenant-B/orders'],
        ['GET', '/api/v1/partners/tenant-B/orders/pdf?date=2026-12-20'],
        ['POST', `/api/v1/partners/tenant-B/orders/${orderB.id}/cancel`, {}],
        ['GET', '/api/v1/partners/tenant-B/conversations'],
        ['GET', `/api/v1/partners/tenant-B/conversations/${convB.id}/messages`],
        ['POST', `/api/v1/partners/tenant-B/conversations/${convB.id}/pause`, { paused: true }],
        ['GET', '/api/v1/channels/sessions/pme%3Atenant-B/qr'],
        ['POST', '/api/v1/channels/sessions/pme%3Atenant-B/disconnect', { wipeAuth: true }],
      ];

      for (const [method, urlPath, body] of forbiddenRequests) {
        const res = await fetch(`${baseUrl}${urlPath}`, {
          method,
          headers: authA,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        assert.equal(res.status, 403, `Expected 403 on ${method} ${urlPath}, got ${res.status}`);
      }

      // 3b. IDOR attempts using Tenant A's URL with Tenant B's record IDs -> 404
      const idorRequests = [
        ['PUT', `/api/v1/partners/tenant-A/catalog/${svcB.id}`, { name: 'Hacked' }],
        ['DELETE', `/api/v1/partners/tenant-A/catalog/${svcB.id}`],
        ['POST', `/api/v1/partners/tenant-A/appointments/${apptB.id}/cancel`, {}],
        ['POST', `/api/v1/partners/tenant-A/orders/${orderB.id}/cancel`, {}],
        ['GET', `/api/v1/partners/tenant-A/conversations/${convB.id}/messages`],
        ['POST', `/api/v1/partners/tenant-A/conversations/${convB.id}/pause`, { paused: true }],
      ];

      for (const [method, urlPath, body] of idorRequests) {
        const res = await fetch(`${baseUrl}${urlPath}`, {
          method,
          headers: authA,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        assert.equal(res.status, 404, `Expected 404 on IDOR ${method} ${urlPath}, got ${res.status}`);
      }

      // 3c. POST /api/v1/ai/test with Tenant A Bearer + body.partnerId='tenant-B' must NOT leak Tenant B context
      const aiTestRes = await fetch(`${baseUrl}/api/v1/ai/test`, {
        method: 'POST',
        headers: authA,
        body: JSON.stringify({ mode: 'agent', partnerId: 'tenant-B', message: 'Oi' }),
      });
      assert.equal(aiTestRes.status, 200);
      assert.equal(capturedAiSystemPrompts.length, 1);
      assert.equal(capturedAiSystemPrompts[0].includes('Empresa Beta SECRETA'), false);
      assert.equal(capturedAiSystemPrompts[0].includes('Serviço Confidencial B'), false);
      assert.match(capturedAiSystemPrompts[0], /Empresa Alpha/);

      // 3d. Repository-level scoped lookups for Tenant A cannot see Tenant B records
      assert.equal(fx.catalogRepository.findById(svcB.id, { partnerId: 'tenant-A' }), null);
      assert.equal(fx.appointmentRepository.findById(apptB.id, { partnerId: 'tenant-A' }), null);
      assert.equal(fx.orderRepository.findById(orderB.id, { partnerId: 'tenant-A' }), null);
      assert.equal(fx.conversationRepository.findById(convB.id, { partnerId: 'tenant-A' }), null);
      assert.deepEqual(
        fx.conversationRepository.listMessages(convB.id, { partnerId: 'tenant-A' }),
        []
      );

      // 3e. Confirm Tenant B data remains 100% intact
      assert.equal(fx.catalogRepository.findById(svcB.id, { partnerId: 'tenant-B' }).active, 1);
      assert.equal(fx.appointmentRepository.findById(apptB.id, { partnerId: 'tenant-B' }).status, 'CONFIRMED');
      assert.equal(fx.orderRepository.findById(orderB.id, { partnerId: 'tenant-B' }).status, 'CONFIRMED');
      assert.equal(fx.conversationRepository.findById(convB.id, { partnerId: 'tenant-B' }).is_paused, 0);
      assert.ok(tokenB);
    } finally {
      const shutdownRes = await fx.cleanup();
      assert.equal(shutdownRes.ok, true);
    }
  });

  test('4. Isolamento de Falha e Vazão na Fila de Saída (200 msgs / 10 Tenants: 2 com falha não bloqueiam 8 saudáveis)', async () => {
    const fx = createDiskFixture('outbox-isolation');
    const failingKeys = ['pme:out_t01', 'pme:out_t02'];
    const delayMap = new Map([
      ['pme:out_t01', 15],
      ['pme:out_t02', 15],
    ]);
    const adapter = new StressChannelAdapter({
      failingSessions: failingKeys,
      delayBySession: delayMap,
    });

    const outboxWorker = new OutboundQueueWorker({
      queueRepository: fx.queueRepository,
      channelAdapter: adapter,
      minPresenceMs: 0,
      maxPresenceMs: 0,
      maxConcurrentSessions: 10,
      retryBaseMs: 60_000,
    });

    try {
      // Enqueue 200 messages (20 per tenant x 10 tenants), intentionally enqueueing failing tenants FIRST
      for (let t = 1; t <= 10; t += 1) {
        const sessionKey = `pme:out_t${String(t).padStart(2, '0')}`;
        for (let m = 1; m <= 20; m += 1) {
          fx.queueRepository.enqueueOutbox({
            sessionKey,
            channel: 'whatsapp',
            recipientId: `551190000${String(m).padStart(4, '0')}@s.whatsapp.net`,
            payload: { type: 'text', text: `Msg ${m} de ${sessionKey}` },
          });
        }
      }

      const t0 = performance.now();
      const batchRes = await outboxWorker.processOnce({ limit: 200 });
      const elapsedMs = performance.now() - t0;

      // All 8 healthy tenants (8 x 20 = 160 msgs) delivered in a single concurrent pass
      assert.equal(batchRes.processed, 200);
      assert.equal(batchRes.sent, 160);
      assert.equal(batchRes.retried, 40);
      assert.equal(adapter.sent.length, 160);
      assert.ok(
        elapsedMs < 2000,
        `Healthy tenants should not be stalled by failing tenants (elapsed=${elapsedMs.toFixed(1)}ms)`
      );

      // Verify strict FIFO ordering per healthy tenant
      for (let t = 3; t <= 10; t += 1) {
        const sk = `pme:out_t${String(t).padStart(2, '0')}`;
        const tenantMsgs = adapter.sent.filter((s) => s.sessionKey === sk);
        assert.equal(tenantMsgs.length, 20);
        assert.equal(tenantMsgs[0].text, `Msg 1 de ${sk}`);
        assert.equal(tenantMsgs[19].text, `Msg 20 de ${sk}`);
      }
    } finally {
      const shutdownRes = await fx.cleanup();
      assert.equal(shutdownRes.ok, true);
    }
  });
});
