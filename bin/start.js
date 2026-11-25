'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
const { LlmRouter } = require('../core/ai/LlmRouter');
const { AgentEngine } = require('../core/ai/AgentEngine');
const { CloudVoiceAdapter } = require('../core/ai/voice/CloudVoiceAdapter');
const { LocalVoiceAdapter } = require('../core/ai/voice/LocalVoiceAdapter');

const { WhatsAppBaileysAdapter } = require('../core/messaging/adapters/WhatsAppBaileysAdapter');
const { SessionManager } = require('../core/messaging/SessionManager');
const { MessageDebouncer } = require('../core/messaging/MessageDebouncer');
const { OutboundQueueWorker } = require('../core/messaging/OutboundQueueWorker');
const { PauseController } = require('../core/messaging/PauseController');

const { GatewayServer } = require('../core/gateway/Server');
const { LifecycleManager } = require('../core/lifecycle/LifecycleManager');

/**
 * Loads `.env` safely (handling CRLF, spaces around `=`, quotes, and `#` comments)
 * without overwriting variables already injected in `process.env`.
 */
function loadNativeEnv(envPath) {
  const candidates = envPath
    ? [path.resolve(envPath)]
    : [
        path.resolve(__dirname, '..', '.env'),
        path.resolve(process.cwd(), '.env'),
      ];

  const targetPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!targetPath) return false;

  const raw = fs.readFileSync(targetPath, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let val = (match[2] || '').trim();

    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    } else {
      const hashIdx = val.indexOf(' #');
      if (hashIdx !== -1) {
        val = val.slice(0, hashIdx).trim();
      }
    }

    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
  return true;
}

/**
 * Validates mandatory production secrets per Doc 02 Section 2.2.
 */
function assertProductionSecrets() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || !process.env.WEBHOOK_SIGNING_SECRET) {
      throw new Error(
        'FATAL: JWT_SECRET and WEBHOOK_SIGNING_SECRET are required when NODE_ENV=production'
      );
    }
  }
}

/**
 * Official production bootstrap orchestrating Layers 1 through 5 and LifecycleManager.
 * @param {{
 *   dbPath?: string,
 *   sessionsDir?: string,
 *   port?: number,
 *   host?: string,
 *   channelAdapter?: import('../core/messaging/ChannelAdapter').ChannelAdapter,
 *   llmRouter?: LlmRouter,
 *   startWorker?: boolean,
 *   startHttp?: boolean,
 *   installSignals?: boolean
 * }} [options]
 */
async function bootstrap(options = {}) {
  loadNativeEnv(options.envPath);
  assertProductionSecrets();

  const lifecycle = new LifecycleManager();

  // Layer 1 — Storage SQLite & Migrations
  const dbManager = new DatabaseManager({ dbPath: options.dbPath });
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

  // Layer 2 — Domain Services
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
  const customerService = new CustomerService({ dbManager, customerRepository });
  const pdfService = new PdfService();

  // Layer 3 — AI Engine, PromptPin & VoiceAdapter
  const promptPin = new PromptPin();
  promptPin.verifyAtBoot({ strict: true });

  const sttDriver = String(process.env.VOICE_STT_DRIVER || 'cloud').toLowerCase();
  const voiceAdapter =
    sttDriver === 'local' ? new LocalVoiceAdapter() : new CloudVoiceAdapter();

  const llmRouter = options.llmRouter || new LlmRouter();
  const agentEngine = new AgentEngine({
    dbManager,
    llmRouter,
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

  // Layer 4 — Resilient Messaging
  const pauseController = new PauseController({ conversationRepository });
  const debouncer = new MessageDebouncer();

  let sessionManagerRef = null;
  const channelAdapter =
    options.channelAdapter ||
    new WhatsAppBaileysAdapter({
      voiceAdapter,
      authDirResolver: (sk) =>
        sessionManagerRef
          ? sessionManagerRef.resolveSessionPaths(sk).authDir
          : path.resolve(process.cwd(), 'workspace', 'sessions', DatabaseManager.sanitizeKey(sk), 'baileys_auth'),
      partnerIdResolver: (sk) => {
        const { parseSessionKey } = require('../core/messaging/SessionManager');
        return parseSessionKey(sk).partnerId;
      },
    });

  const outboxWorker = new OutboundQueueWorker({
    queueRepository,
    channelAdapter,
  });

  const sessionManager = new SessionManager({
    dbManager,
    sessionsDir: options.sessionsDir,
    channelAdapter,
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
  if (options.restoreSessions !== false) {
    await sessionManager.restorePersistedSessions();
  }

  lifecycle.register('messaging-sessions', () => sessionManager.close());
  if (options.startWorker !== false) {
    outboxWorker.start();
  }
  lifecycle.register('outbox-worker', () => outboxWorker.stop());

  // Layer 5 — Gateway REST, SSE & Webhooks
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
    llmRouter,
    agentEngine,
    sessionManager,
    pauseController,
  });

  // Forward guard & appointment/order commits from AgentEngine or SessionManager to SSE/Webhooks if desired
  lifecycle.register('http-gateway', () => server.close());

  let listenInfo = null;
  if (options.startHttp !== false) {
    listenInfo = await server.listen({
      port: options.port ?? Number(process.env.PORT || 3000),
      host: options.host || '0.0.0.0',
    });
  }

  if (options.installSignals !== false) {
    lifecycle.installSignals();
  }

  return {
    lifecycle,
    dbManager,
    promptPin,
    llmRouter,
    agentEngine,
    sessionManager,
    outboxWorker,
    pauseController,
    server,
    listenInfo,
  };
}

if (require.main === module) {
  bootstrap()
    .then(({ listenInfo, llmRouter }) => {
      if (listenInfo) {
        console.log(
          `[AUTONMAX vNext] Server listening on http://localhost:${listenInfo.port} (host=${listenInfo.address}, groqModel=${llmRouter.models.groq})`
        );
      }
    })
    .catch((err) => {
      console.error('[AUTONMAX_vNext_BOOT_FAILED]', err);
      process.exit(1);
    });
}

module.exports = { bootstrap, loadNativeEnv, assertProductionSecrets };
