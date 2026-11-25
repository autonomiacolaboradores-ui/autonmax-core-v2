'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const { DatabaseManager } = require('../core/storage/DatabaseManager');
const { PartnerRepository } = require('../core/storage/repositories/PartnerRepository');
const { AuthRepository } = require('../core/storage/repositories/AuthRepository');
const { CatalogRepository } = require('../core/storage/repositories/CatalogRepository');
const { CustomerRepository } = require('../core/storage/repositories/CustomerRepository');
const { ConversationRepository } = require('../core/storage/repositories/ConversationRepository');
const { AppointmentRepository } = require('../core/storage/repositories/AppointmentRepository');
const { OrderRepository } = require('../core/storage/repositories/OrderRepository');
const { QueueRepository } = require('../core/storage/repositories/QueueRepository');
const { LifecycleManager } = require('../core/lifecycle/LifecycleManager');

const EXPECTED_TABLES = [
  'schema_migrations',
  'partners',
  'user_sessions',
  'catalog_items',
  'customers',
  'conversations',
  'messages',
  'appointments',
  'orders',
  'processed_events',
  'outbox_queue',
  'reminders',
  'audit_logs',
  'partner_integrations',
];

function createInMemorySetup() {
  const dbManager = new DatabaseManager({ dbPath: ':memory:' });
  dbManager.init();
  return {
    dbManager,
    partners: new PartnerRepository(dbManager),
    auth: new AuthRepository(dbManager),
    catalog: new CatalogRepository(dbManager),
    customers: new CustomerRepository(dbManager),
    conversations: new ConversationRepository(dbManager),
    appointments: new AppointmentRepository(dbManager),
    orders: new OrderRepository(dbManager),
    queue: new QueueRepository(dbManager),
  };
}

describe('Layer 1 — Foundation, SQLite Storage & LifecycleManager', () => {
  test('1. Migrations limpas em :memory: e em arquivo temporário com PRAGMAs obrigatórios', () => {
    // 1a. :memory:
    const memDb = new DatabaseManager({ dbPath: ':memory:' });
    const firstMem = memDb.init();
    assert.deepEqual(firstMem.applied, [1, 2, 3]);
    assert.equal(firstMem.currentVersion, 3);

    const secondMem = memDb.migrate();
    assert.deepEqual(secondMem.applied, []);
    assert.deepEqual(secondMem.skipped, [1, 2, 3]);
    assert.equal(secondMem.currentVersion, 3);

    const partnerCols = memDb
      .getDb()
      .prepare('PRAGMA table_info(partners)')
      .all()
      .map((c) => c.name);
    assert.ok(partnerCols.includes('logo_data_url'), 'Migration 002 must add logo_data_url');

    const memTables = memDb
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);
    for (const table of EXPECTED_TABLES) {
      assert.ok(memTables.includes(table), `Missing table in :memory: DB: ${table}`);
    }
    memDb.close();
    assert.equal(memDb.isOpen(), false);

    // 1b. Temporary file on disk (verifies WAL + PRAGMAs + persistence)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-vnext-l1-'));
    const dbPath = path.join(tmpDir, 'nested', 'autonmax.db');
    const fileDb = new DatabaseManager({ dbPath });

    try {
      const migrationRes = fileDb.init();
      assert.deepEqual(migrationRes.applied, [1, 2, 3]);
      assert.ok(fs.existsSync(dbPath), 'SQLite database file should be created');

      const pragmas = fileDb.getPragmas();
      assert.equal(pragmas.journal_mode.toLowerCase(), 'wal');
      assert.equal(pragmas.synchronous, 1); // NORMAL = 1
      assert.equal(pragmas.foreign_keys, 1);
      assert.equal(pragmas.busy_timeout, 5000);

      const applied = fileDb.getAppliedMigrations();
      assert.equal(applied.length, 3);
      assert.equal(applied[0].version, 1);
      assert.equal(applied[1].version, 2);
      assert.equal(applied[2].version, 3);

      const idxRow = fileDb
        .getDb()
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_appointments_unique_slot'"
        )
        .get();
      assert.ok(idxRow, 'idx_appointments_unique_slot index must exist');

      fileDb.close();
      assert.equal(fileDb.isOpen(), false);

      // Reopen to verify idempotency across restarts
      const reopened = new DatabaseManager({ dbPath });
      try {
        const rerun = reopened.init();
        assert.deepEqual(rerun.applied, []);
        assert.deepEqual(rerun.skipped, [1, 2, 3]);
      } finally {
        reopened.close();
      }
    } finally {
      fileDb.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('2. Constraint de concorrência (double-booking): falha atômica em idx_appointments_unique_slot', () => {
    const { dbManager, partners, catalog, customers, appointments } = createInMemorySetup();

    try {
      const partner = partners.create({
        id: 'partner-1',
        email: 'clinic@autonmax.dev',
        displayName: 'Clínica Modelo',
      });
      const service = catalog.create({
        id: 'svc-corte',
        partnerId: partner.id,
        itemType: 'SERVICE',
        name: 'Consulta Padrão',
        priceCents: 15000,
        durationMinutes: 30,
      });
      const customerA = customers.upsert({
        id: 'cust-a',
        partnerId: partner.id,
        channel: 'whatsapp',
        externalId: '5511999990001@s.whatsapp.net',
        name: 'Alice',
      });
      const customerB = customers.upsert({
        id: 'cust-b',
        partnerId: partner.id,
        channel: 'whatsapp',
        externalId: '5511999990002@s.whatsapp.net',
        name: 'Bruno',
      });

      const first = appointments.create({
        id: 'appt-1',
        partnerId: partner.id,
        customerId: customerA.id,
        catalogItemId: service.id,
        clientName: 'Alice',
        dateStr: '2026-12-01',
        timeSlot: '10:00',
        idempotencyKey: 'idem-appt-1',
      });
      assert.equal(first.status, 'CONFIRMED');

      // Duplicate CONFIRMED booking on exact same (partner_id, date_str, time_slot)
      assert.throws(
        () => {
          appointments.create({
            id: 'appt-2',
            partnerId: partner.id,
            customerId: customerB.id,
            catalogItemId: service.id,
            clientName: 'Bruno',
            dateStr: '2026-12-01',
            timeSlot: '10:00',
            idempotencyKey: 'idem-appt-2',
          });
        },
        (err) => {
          assert.equal(err.code, 'ERR_SQLITE_ERROR');
          assert.match(err.message, /UNIQUE constraint failed/i);
          return true;
        }
      );

      const dayAppointments = appointments.listByPartnerAndDate(
        partner.id,
        '2026-12-01'
      );
      assert.equal(dayAppointments.length, 1);
      assert.equal(dayAppointments[0].id, 'appt-1');

      // Partial index releases slot once first booking is CANCELLED
      appointments.cancel('appt-1');
      const rebooked = appointments.create({
        id: 'appt-3',
        partnerId: partner.id,
        customerId: customerB.id,
        catalogItemId: service.id,
        clientName: 'Bruno',
        dateStr: '2026-12-01',
        timeSlot: '10:00',
      });
      assert.equal(rebooked.status, 'CONFIRMED');
      assert.equal(rebooked.client_name, 'Bruno');
    } finally {
      dbManager.close();
    }
  });

  test('3. Preservação por Soft-delete: alteração e desativação de catálogo preservam histórico', () => {
    const { dbManager, partners, catalog, customers, appointments, orders } =
      createInMemorySetup();

    try {
      const partner = partners.create({
        id: 'partner-soft',
        email: 'shop@autonmax.dev',
        displayName: 'Loja & Studio',
      });
      const customer = customers.upsert({
        id: 'cust-soft',
        partnerId: partner.id,
        channel: 'whatsapp',
        externalId: '5511888887777@s.whatsapp.net',
        name: 'Carla',
      });

      const service = catalog.create({
        id: 'svc-massage',
        partnerId: partner.id,
        itemType: 'SERVICE',
        name: 'Massagem Relaxante',
        description: 'Sessão de 60 minutos',
        priceCents: 18000,
        durationMinutes: 60,
      });
      const product = catalog.create({
        id: 'prd-oil',
        partnerId: partner.id,
        itemType: 'PRODUCT',
        name: 'Óleo Essencial',
        description: 'Frasco 50ml',
        priceCents: 6500,
      });

      const oldServiceHash = service.version_hash;
      const appt = appointments.create({
        id: 'appt-hist-1',
        partnerId: partner.id,
        customerId: customer.id,
        catalogItemId: service.id,
        clientName: 'Carla',
        dateStr: '2026-12-05',
        timeSlot: '14:00',
      });
      const order = orders.create({
        id: 'ord-hist-1',
        partnerId: partner.id,
        customerId: customer.id,
        clientName: 'Carla',
        items: [{ catalogItemId: product.id, qty: 2 }],
        paymentMethod: 'PIX',
        deliveryType: 'PICKUP',
      });

      assert.equal(appt.item_name_snapshot, 'Massagem Relaxante');
      assert.equal(appt.price_cents_snapshot, 18000);
      assert.equal(appt.duration_minutes_snapshot, 60);
      assert.equal(order.total_cents, 13000);

      // Update price/name and then soft-delete both catalog items
      const updatedService = catalog.update(service.id, {
        name: 'Massagem Premium Plus',
        priceCents: 25000,
        durationMinutes: 90,
      });
      assert.notEqual(updatedService.version_hash, oldServiceHash);

      const deactivatedService = catalog.softDelete(service.id);
      const deactivatedProduct = catalog.softDelete(product.id);
      assert.equal(deactivatedService.active, 0);
      assert.equal(deactivatedProduct.active, 0);

      // Active listings hide soft-deleted items
      assert.equal(catalog.listByPartner(partner.id).length, 0);
      assert.equal(catalog.listByPartner(partner.id, { includeInactive: true }).length, 2);

      // Cannot book or order deactivated items
      assert.throws(() => {
        appointments.create({
          partnerId: partner.id,
          catalogItemId: service.id,
          clientName: 'Novo Cliente',
          dateStr: '2026-12-06',
          timeSlot: '09:00',
        });
      }, /inactive/i);
      assert.throws(() => {
        orders.create({
          partnerId: partner.id,
          clientName: 'Novo Cliente',
          items: [{ catalogItemId: product.id, qty: 1 }],
        });
      }, /inactive/i);

      // Historical records remain intact with original snapshots
      const persistedAppt = appointments.findById('appt-hist-1');
      assert.equal(persistedAppt.item_name_snapshot, 'Massagem Relaxante');
      assert.equal(persistedAppt.price_cents_snapshot, 18000);
      assert.equal(persistedAppt.duration_minutes_snapshot, 60);

      const persistedOrder = orders.findById('ord-hist-1');
      assert.equal(persistedOrder.total_cents, 13000);
      assert.equal(persistedOrder.items[0].name, 'Óleo Essencial');
      assert.equal(persistedOrder.items[0].price_cents, 6500);
      assert.equal(persistedOrder.items[0].qty, 2);
    } finally {
      dbManager.close();
    }
  });

  test('4. Encerramento limpo: LifecycleManager fecha recursos em ordem inversa sem travar', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-vnext-lc-'));
    const dbPath = path.join(tmpDir, 'lifecycle.db');
    const dbManager = new DatabaseManager({ dbPath });
    dbManager.init();

    const closedOrder = [];
    const fakeProcess = new EventEmitter();
    const lifecycle = new LifecycleManager({
      drainTimeoutMs: 500,
      processRef: fakeProcess,
      logger: { error() {} },
    });

    try {
      lifecycle.installSignals();
      assert.equal(fakeProcess.listenerCount('SIGINT'), 1);
      assert.equal(fakeProcess.listenerCount('SIGTERM'), 1);

      lifecycle.register('sqlite', () => {
        dbManager.close();
        closedOrder.push('sqlite');
      });
      lifecycle.register('sockets', async () => {
        await Promise.resolve();
        closedOrder.push('sockets');
      });
      lifecycle.register('outbox-worker', () => {
        closedOrder.push('outbox-worker');
      });
      lifecycle.register('http-gateway', async () => {
        await Promise.resolve();
        closedOrder.push('http-gateway');
      });

      // Trigger via SIGTERM on isolated emitter (must not call process.exit)
      fakeProcess.emit('SIGTERM');
      const result = await lifecycle.shutdown('SIGTERM');

      assert.equal(result.ok, true);
      assert.deepEqual(closedOrder, [
        'http-gateway',
        'outbox-worker',
        'sockets',
        'sqlite',
      ]);
      assert.equal(dbManager.isOpen(), false);
      assert.equal(lifecycle.isClosed(), true);
      assert.equal(fakeProcess.listenerCount('SIGINT'), 0);
      assert.equal(fakeProcess.listenerCount('SIGTERM'), 0);

      // Idempotent second shutdown returns same result
      const second = await lifecycle.shutdown('SIGINT');
      assert.deepEqual(second, result);

      // Verify error isolation: an error in one resource does not block closing earlier ones
      const isolatedOrder = [];
      const lifecycleWithError = new LifecycleManager({
        drainTimeoutMs: 200,
        processRef: new EventEmitter(),
        logger: { error() {} },
      });
      lifecycleWithError.register('db-last', () => isolatedOrder.push('db-last'));
      lifecycleWithError.register('broken-step', () => {
        throw new Error('simulated close error');
      });
      lifecycleWithError.register('http-first', () => isolatedOrder.push('http-first'));

      const errResult = await lifecycleWithError.shutdown('test-error');
      assert.equal(errResult.ok, false);
      assert.equal(errResult.errors.length, 1);
      assert.equal(errResult.errors[0].name, 'broken-step');
      assert.deepEqual(isolatedOrder, ['http-first', 'db-last']);
    } finally {
      lifecycle.uninstallSignals();
      dbManager.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('5. Contrato completo dos Repositórios: Auth, Customers, Conversations, Queue e Audit/Integrations', () => {
    const { dbManager, partners, auth, customers, conversations, queue } =
      createInMemorySetup();

    try {
      const partner = partners.create({
        id: 'p-full',
        email: 'Full@Example.COM',
        displayName: 'Full Partner',
        workingHours: { mon: '09:00-18:00' },
      });
      assert.equal(partner.email, 'full@example.com');
      assert.deepEqual(partner.working_hours, { mon: '09:00-18:00' });

      // Partner integrations & audit logs
      const integration = partners.upsertIntegration({
        partnerId: partner.id,
        provider: 'google_calendar',
        credentials: { access_token: 'tok-123' },
        expiresAt: 1999999999000,
      });
      assert.equal(integration.credentials.access_token, 'tok-123');

      const audit = partners.recordAudit({
        partnerId: partner.id,
        eventType: 'BOOT_CHECK',
        severity: 'INFO',
        message: 'Storage initialized',
        metadata: { layer: 1 },
      });
      assert.equal(audit.metadata.layer, 1);
      assert.equal(partners.listAuditLogs(partner.id).length, 1);

      // Auth sessions
      const rawToken = 'secret-session-token';
      const now = 1_700_000_000_000;
      auth.createSession({
        token: rawToken,
        partnerId: partner.id,
        expiresAt: now + 60_000,
      });
      const tokenHash = AuthRepository.hashToken(rawToken);
      assert.ok(auth.findValidSession(tokenHash, now + 1000));
      assert.equal(auth.findValidSession(tokenHash, now + 120_000), null);
      assert.equal(auth.purgeExpiredSessions(now + 120_000), 1);

      // Customers & facts merge
      const customer = customers.upsert({
        id: 'cust-1',
        partnerId: partner.id,
        channel: 'whatsapp',
        externalId: '5511999999999@s.whatsapp.net',
        name: 'Diego',
        phone: '5511999999999',
        facts: { preferred_day: 'Friday' },
      });
      const merged = customers.updateFacts(customer.id, { allergy: 'none' });
      assert.deepEqual(merged.facts, { preferred_day: 'Friday', allergy: 'none' });
      assert.equal(customers.incrementVisits(customer.id).visits_count, 1);

      // Conversations, soft-pause, messages
      const conv = conversations.upsertConversation({
        id: 'conv-1',
        partnerId: partner.id,
        customerId: customer.id,
        channel: 'whatsapp',
        externalChatId: '5511999999999@s.whatsapp.net',
      });
      conversations.setPaused(conv.id, true, { humanRequested: true });
      const pausedConv = conversations.appendPausedContext(conv.id, {
        role: 'operator',
        text: 'Assumi o atendimento',
      });
      assert.equal(pausedConv.is_paused, 1);
      assert.equal(pausedConv.human_requested, 1);
      assert.equal(pausedConv.paused_context.length, 1);

      conversations.addMessage({
        id: 'msg-1',
        conversationId: conv.id,
        partnerId: partner.id,
        direction: 'INBOUND',
        role: 'user',
        content: 'Olá, quero agendar',
      });
      conversations.addMessage({
        id: 'msg-2',
        conversationId: conv.id,
        partnerId: partner.id,
        direction: 'OUTBOUND',
        role: 'assistant',
        content: 'Claro! Qual horário prefere?',
      });
      const recent = conversations.getRecentMessages(conv.id, 10);
      assert.equal(recent.length, 2);
      assert.equal(recent[0].id, 'msg-1');
      assert.equal(recent[1].id, 'msg-2');

      // Queue atomic idempotency + outbox lifecycle
      const firstEnqueue = queue.enqueueWithIdempotency({
        eventKey: 'wa:msg-100',
        sessionKey: DatabaseManager.sanitizeKey('pme:partner-1'),
        outboxId: 'out-1',
        channel: 'whatsapp',
        recipientId: '5511999999999@s.whatsapp.net',
        payload: { text: 'Confirmado!' },
        nextAttemptAt: now,
      });
      assert.equal(firstEnqueue.duplicate, false);
      assert.equal(firstEnqueue.enqueued, true);
      assert.equal(firstEnqueue.outbox.id, 'out-1');

      const dupEnqueue = queue.enqueueWithIdempotency({
        eventKey: 'wa:msg-100',
        sessionKey: DatabaseManager.sanitizeKey('pme:partner-1'),
        outboxId: 'out-2',
        channel: 'whatsapp',
        recipientId: '5511999999999@s.whatsapp.net',
        payload: { text: 'Duplicado!' },
        nextAttemptAt: now,
      });
      assert.equal(dupEnqueue.duplicate, true);
      assert.equal(dupEnqueue.enqueued, false);

      const due = queue.fetchDueOutbox({ nowMs: now + 100 });
      assert.equal(due.length, 1);
      assert.equal(due[0].payload.text, 'Confirmado!');

      const retried = queue.markOutboxRetry('out-1', { nextAttemptAt: now + 5000 });
      assert.equal(retried.attempts, 1);
      assert.equal(queue.fetchDueOutbox({ nowMs: now + 100 }).length, 0);

      const sent = queue.markOutboxSent('out-1');
      assert.equal(sent.status, 'SENT');
    } finally {
      dbManager.close();
    }
  });

  test('6. Isolamento multi-tenant por partner_id e parametrização de DB_PATH', () => {
    const {
      dbManager,
      partners,
      catalog,
      customers,
      conversations,
      appointments,
      orders,
    } = createInMemorySetup();

    try {
      const pA = partners.create({
        id: 'partner-a',
        email: 'a@autonmax.dev',
        displayName: 'Parceiro A',
      });
      const pB = partners.create({
        id: 'partner-b',
        email: 'b@autonmax.dev',
        displayName: 'Parceiro B',
      });

      const svcA = catalog.create({
        id: 'svc-a',
        partnerId: pA.id,
        itemType: 'SERVICE',
        name: 'Serviço A',
        priceCents: 5000,
      });
      const prodA = catalog.create({
        id: 'prd-a',
        partnerId: pA.id,
        itemType: 'PRODUCT',
        name: 'Produto A',
        priceCents: 3000,
      });
      const custA = customers.upsert({
        id: 'cust-a-iso',
        partnerId: pA.id,
        channel: 'whatsapp',
        externalId: '551100000001@s.whatsapp.net',
        name: 'Cliente A',
      });
      const convA = conversations.upsertConversation({
        id: 'conv-a-iso',
        partnerId: pA.id,
        customerId: custA.id,
        channel: 'whatsapp',
        externalChatId: '551100000001@s.whatsapp.net',
      });
      conversations.addMessage({
        id: 'msg-a-iso',
        conversationId: convA.id,
        partnerId: pA.id,
        direction: 'INBOUND',
        role: 'user',
        content: 'Oi',
      });
      const apptA = appointments.create({
        id: 'appt-a-iso',
        partnerId: pA.id,
        customerId: custA.id,
        catalogItemId: svcA.id,
        clientName: 'Cliente A',
        dateStr: '2026-12-10',
        timeSlot: '11:00',
      });
      const orderA = orders.create({
        id: 'ord-a-iso',
        partnerId: pA.id,
        customerId: custA.id,
        clientName: 'Cliente A',
        items: [{ catalogItemId: prodA.id, qty: 1 }],
      });

      // Partner B cannot read or mutate Partner A records when partnerId is scoped
      assert.equal(catalog.findById(svcA.id, { partnerId: pB.id }), null);
      assert.equal(catalog.update(svcA.id, { name: 'Hack' }, { partnerId: pB.id }), null);
      assert.equal(customers.findById(custA.id, { partnerId: pB.id }), null);
      assert.equal(customers.updateFacts(custA.id, { hack: true }, { partnerId: pB.id }), null);
      assert.equal(conversations.findById(convA.id, { partnerId: pB.id }), null);
      assert.equal(conversations.listMessages(convA.id, { partnerId: pB.id }).length, 0);
      assert.equal(appointments.findById(apptA.id, { partnerId: pB.id }), null);
      assert.equal(appointments.cancel(apptA.id, { partnerId: pB.id }), null);
      assert.equal(orders.findById(orderA.id, { partnerId: pB.id }), null);
      assert.equal(orders.cancel(orderA.id, { partnerId: pB.id }), null);

      // Partner A's records remain intact
      assert.equal(catalog.findById(svcA.id, { partnerId: pA.id }).name, 'Serviço A');
      assert.equal(appointments.findById(apptA.id, { partnerId: pA.id }).status, 'CONFIRMED');
      assert.equal(orders.findById(orderA.id, { partnerId: pA.id }).status, 'CONFIRMED');

      // Parameterized DB_PATH resolution
      const prevDbPath = process.env.DB_PATH;
      try {
        process.env.DB_PATH = '/var/data/autonmax.db';
        const prodMgr = new DatabaseManager();
        assert.equal(prodMgr.dbPath, '/var/data/autonmax.db');
        delete process.env.DB_PATH;
        const localMgr = new DatabaseManager();
        assert.equal(
          localMgr.dbPath,
          path.resolve(process.cwd(), 'workspace', 'autonmax.db')
        );
      } finally {
        if (prevDbPath === undefined) {
          delete process.env.DB_PATH;
        } else {
          process.env.DB_PATH = prevDbPath;
        }
      }
    } finally {
      dbManager.close();
    }
  });
});
