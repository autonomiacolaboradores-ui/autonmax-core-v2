'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const { DatabaseManager } = require('../core/storage/DatabaseManager');
const { PartnerRepository } = require('../core/storage/repositories/PartnerRepository');
const { CustomerRepository } = require('../core/storage/repositories/CustomerRepository');
const { ConversationRepository } = require('../core/storage/repositories/ConversationRepository');
const { QueueRepository } = require('../core/storage/repositories/QueueRepository');
const { ChannelAdapter } = require('../core/messaging/ChannelAdapter');
const { WhatsAppBaileysAdapter } = require('../core/messaging/adapters/WhatsAppBaileysAdapter');
const { SessionManager } = require('../core/messaging/SessionManager');
const { SessionWatchdog } = require('../core/messaging/SessionWatchdog');
const { MessageDebouncer } = require('../core/messaging/MessageDebouncer');
const { OutboundQueueWorker } = require('../core/messaging/OutboundQueueWorker');
const { PauseController } = require('../core/messaging/PauseController');
const { VoiceAdapter } = require('../core/ai/voice/VoiceAdapter');
const { LifecycleManager } = require('../core/lifecycle/LifecycleManager');

class MockChannelAdapter extends ChannelAdapter {
  constructor() {
    super();
    this.sentMessages = [];
    this.presenceCalls = [];
    this.readReceipts = [];
    this.statuses = new Map();
  }

  async connect(sessionKey) {
    this.statuses.set(sessionKey, 'CONNECTED');
  }

  async disconnect(sessionKey) {
    this.statuses.set(sessionKey, 'DISCONNECTED');
  }

  async getStatus(sessionKey) {
    return this.statuses.get(sessionKey) || 'DISCONNECTED';
  }

  async getQr() {
    return null;
  }

  async sendPresence(sessionKey, recipientId, state) {
    this.presenceCalls.push({ sessionKey, recipientId, state });
  }

  async markRead(sessionKey, keys) {
    this.readReceipts.push({ sessionKey, keys });
  }

  async sendMessage(sessionKey, recipientId, payload) {
    const msg = { sessionKey, recipientId, payload };
    this.sentMessages.push(msg);
    return { messageId: `mock_${this.sentMessages.length}`, timestamp: new Date().toISOString() };
  }

  async simulateIncoming(event) {
    return this._emitMessage(event);
  }
}

function createMessagingFixture(options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-l4-'));
  const sessionsDir = path.join(tmpDir, 'sessions');
  const dbManager = new DatabaseManager({ dbPath: ':memory:' });
  dbManager.init();

  const partnerRepo = new PartnerRepository(dbManager);
  const customerRepo = new CustomerRepository(dbManager);
  const conversationRepo = new ConversationRepository(dbManager);
  const queueRepo = new QueueRepository(dbManager);

  const partner = partnerRepo.create({
    id: options.partnerId || 'usr_1',
    email: 'l4@autonmax.dev',
    displayName: 'Loja L4',
  });

  const adapter = options.channelAdapter || new MockChannelAdapter();
  const debouncer = new MessageDebouncer({
    windowMs: options.debounceWindowMs ?? 60,
  });
  const outboxWorker = new OutboundQueueWorker({
    queueRepository: queueRepo,
    channelAdapter: adapter,
    minPresenceMs: 0,
    maxPresenceMs: 0,
  });
  const pauseController = new PauseController({
    conversationRepository: conversationRepo,
  });

  const sessionManager = new SessionManager({
    dbManager,
    sessionsDir,
    channelAdapter: adapter,
    agentEngine: options.agentEngine,
    debouncer,
    outboxWorker,
    pauseController,
    partnerRepository: partnerRepo,
    customerRepository: customerRepo,
    conversationRepository: conversationRepo,
    queueRepository: queueRepo,
  });

  return {
    tmpDir,
    sessionsDir,
    dbManager,
    partnerRepo,
    customerRepo,
    conversationRepo,
    queueRepo,
    partner,
    adapter,
    debouncer,
    outboxWorker,
    pauseController,
    sessionManager,
    async cleanup() {
      await sessionManager.close();
      dbManager.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

describe('Layer 4 — Mensageria Resiliente, Debouncer & Fila Anti-Ban', () => {
  test('1. Debouncing Eficiente: 3 mensagens rápidas consolidam em 1 única chamada ao AgentEngine', async () => {
    const engineCalls = [];
    const mockAgent = {
      async processTurn(params) {
        engineCalls.push(params);
        return { ok: true, text: 'Olá! Vamos agendar seu corte.' };
      },
    };

    const fx = createMessagingFixture({
      agentEngine: mockAgent,
      debounceWindowMs: 80,
    });

    try {
      const chatId = '5511999990001@s.whatsapp.net';
      const baseEvent = {
        sessionKey: 'pme:usr_1:line_1',
        partnerId: fx.partner.id,
        channel: 'whatsapp',
        chatId,
        pushName: 'Ana',
      };

      const p1 = fx.sessionManager.handleIncomingEvent({
        ...baseEvent,
        eventKey: 'wa:m1',
        msgId: 'm1',
        text: 'Oi',
      });
      await new Promise((r) => setTimeout(r, 15));
      const p2 = fx.sessionManager.handleIncomingEvent({
        ...baseEvent,
        eventKey: 'wa:m2',
        msgId: 'm2',
        text: 'quero agendar',
      });
      await new Promise((r) => setTimeout(r, 15));
      const p3 = fx.sessionManager.handleIncomingEvent({
        ...baseEvent,
        eventKey: 'wa:m3',
        msgId: 'm3',
        text: 'para amanhã às 14h',
      });

      const results = await Promise.all([p1, p2, p3]);
      assert.equal(engineCalls.length, 1);
      assert.equal(engineCalls[0].message, 'Oi\nquero agendar\npara amanhã às 14h');
      assert.equal(results[2].consolidatedCount, 3);

      // OutboundQueueWorker delivers consolidated reply
      const delivery = await fx.outboxWorker.processOnce();
      assert.equal(delivery.sent, 1);
      assert.equal(fx.adapter.sentMessages.length, 1);
      assert.equal(
        fx.adapter.sentMessages[0].payload.text,
        'Olá! Vamos agendar seu corte.'
      );
      assert.ok(
        fx.adapter.presenceCalls.some((p) => p.state === 'composing'),
        'Worker must emit composing presence before send'
      );
    } finally {
      await fx.cleanup();
    }
  });

  test('2. Idempotência Pós-Commit: falha no AgentEngine NÃO grava processed_events, permitindo reprocessamento', async () => {
    let shouldFail = true;
    let attempts = 0;

    const flakyAgent = {
      async processTurn() {
        attempts += 1;
        if (shouldFail) {
          throw new Error('LLM_CASCADE_UNAVAILABLE');
        }
        return { ok: true, text: 'Processado com sucesso na retentativa!' };
      },
    };

    const fx = createMessagingFixture({
      agentEngine: flakyAgent,
      debounceWindowMs: 20,
    });

    try {
      const event = {
        eventKey: 'wa:retry-msg-1',
        msgId: 'retry-msg-1',
        sessionKey: 'pme:usr_1',
        partnerId: fx.partner.id,
        channel: 'whatsapp',
        chatId: '5511999990002@s.whatsapp.net',
        text: 'Quero agendar',
      };

      await assert.rejects(
        () => fx.sessionManager.handleIncomingEvent(event),
        /LLM_CASCADE_UNAVAILABLE/
      );

      // Must NOT be committed in processed_events or outbox_queue
      assert.equal(fx.queueRepo.isEventProcessed('wa:retry-msg-1'), false);
      assert.equal(fx.queueRepo.fetchDueOutbox().length, 0);

      // Retry succeeds and commits atomically
      shouldFail = false;
      const retryRes = await fx.sessionManager.handleIncomingEvent(event);
      assert.equal(retryRes.ok, true);
      assert.equal(attempts, 2);
      assert.equal(fx.queueRepo.isEventProcessed('wa:retry-msg-1'), true);
      assert.equal(fx.queueRepo.fetchDueOutbox().length, 1);

      // Duplicate delivery after commit is ignored
      const dupRes = await fx.sessionManager.handleIncomingEvent(event);
      assert.equal(dupRes.duplicate, true);
      assert.equal(attempts, 2);
    } finally {
      await fx.cleanup();
    }
  });

  test('3. Comportamento em Soft-Pause: não aciona AgentEngine e acumula em paused_context_json', async () => {
    let agentCalled = 0;
    const mockAgent = {
      async processTurn(params) {
        agentCalled += 1;
        return { ok: true, text: `Retomado com: ${params.message}` };
      },
    };

    const fx = createMessagingFixture({
      agentEngine: mockAgent,
      debounceWindowMs: 20,
    });

    try {
      const chatId = '5511999990003@s.whatsapp.net';
      const customer = fx.customerRepo.upsert({
        partnerId: fx.partner.id,
        channel: 'whatsapp',
        externalId: chatId,
        name: 'Bruno',
      });
      const conv = fx.conversationRepo.upsertConversation({
        partnerId: fx.partner.id,
        customerId: customer.id,
        channel: 'whatsapp',
        externalChatId: chatId,
      });

      fx.pauseController.pause({
        partnerId: fx.partner.id,
        conversationId: conv.id,
        humanRequested: true,
      });

      const pausedRes = await fx.sessionManager.handleIncomingEvent({
        eventKey: 'wa:paused-1',
        msgId: 'paused-1',
        sessionKey: 'pme:usr_1',
        partnerId: fx.partner.id,
        channel: 'whatsapp',
        chatId,
        text: 'Já falei com o atendente que prefiro sexta-feira.',
      });

      assert.equal(pausedRes.paused, true);
      assert.equal(agentCalled, 0);

      const stored = fx.conversationRepo.findById(conv.id, { partnerId: fx.partner.id });
      assert.equal(stored.is_paused, 1);
      assert.equal(stored.paused_context.length, 1);
      assert.equal(
        stored.paused_context[0].text,
        'Já falei com o atendente que prefiro sexta-feira.'
      );

      // Outra conversa ativa do mesmo parceiro continua sendo respondida normalmente pela IA
      const otherChatId = '5511999990004@s.whatsapp.net';
      const otherRes = await fx.sessionManager.handleIncomingEvent({
        eventKey: 'wa:other-active-1',
        msgId: 'other-active-1',
        sessionKey: 'pme:usr_1',
        partnerId: fx.partner.id,
        channel: 'whatsapp',
        chatId: otherChatId,
        text: 'Olá, quero agendar um horário',
      });
      assert.equal(otherRes.ok, true);
      assert.notEqual(otherRes.paused, true);
      assert.equal(agentCalled, 1);
      assert.equal(fx.queueRepo.fetchDueOutbox().length, 1);
      assert.equal(
        fx.conversationRepo.findById(conv.id, { partnerId: fx.partner.id }).is_paused,
        1
      );

      // Resume AI: next message consumes paused context and calls AgentEngine
      fx.pauseController.resume({
        partnerId: fx.partner.id,
        conversationId: conv.id,
        clearContext: false,
      });

      let receivedTurnText = '';
      mockAgent.processTurn = async (params) => {
        agentCalled += 1;
        receivedTurnText = params.message;
        return { ok: true, text: 'Certo, sexta-feira!' };
      };

      await fx.sessionManager.handleIncomingEvent({
        eventKey: 'wa:resumed-2',
        msgId: 'resumed-2',
        sessionKey: 'pme:usr_1',
        partnerId: fx.partner.id,
        channel: 'whatsapp',
        chatId,
        text: 'Pode continuar agora',
      });

      assert.equal(agentCalled, 2);
      assert.match(receivedTurnText, /prefiro sexta-feira/);
      assert.match(receivedTurnText, /Pode continuar agora/);
    } finally {
      await fx.cleanup();
    }
  });

  test('4. Sanitização de Caminhos no Windows: pme:usr_1:line_1 gera caminho sem ":" e valida limite por parceiro', async () => {
    const fx = createMessagingFixture();

    try {
      const resolved = fx.sessionManager.resolveSessionPaths('pme:usr_1:line_1');
      assert.equal(resolved.sanitizedKey, 'pme_usr_1_line_1');

      const relDir = path.relative(fx.sessionsDir, resolved.authDir);
      assert.equal(relDir.includes(':'), false, `Relative path must not contain ":": ${relDir}`);
      assert.equal(relDir, path.join('pme_usr_1_line_1', 'baileys_auth'));

      const line1 = await fx.sessionManager.connectSession('usr_1', 'line_1');
      assert.ok(fs.existsSync(line1.authDir));
      const probeFile = path.join(line1.authDir, 'creds_probe.json');
      fs.writeFileSync(probeFile, JSON.stringify({ ok: true }));
      assert.equal(JSON.parse(fs.readFileSync(probeFile, 'utf8')).ok, true);

      await fx.sessionManager.connectSession('usr_1', 'line_2');
      // 3rd line exceeds MAX_LINES_PER_PARTNER = 2
      assert.throws(
        () => fx.sessionManager.createOrGetSession('usr_1', 'line_3'),
        (err) => err.code === 'MAX_LINES_EXCEEDED'
      );

      // Unauthorized/unknown partner cannot create session
      assert.throws(
        () => fx.sessionManager.createOrGetSession('unknown_partner', 'line_1'),
        (err) => err.code === 'PARTNER_NOT_FOUND'
      );
    } finally {
      await fx.cleanup();
    }
  });

  test('5. Fallback em Transcrição de Áudio + WhatsAppBaileysAdapter (QR #000000, removeAllListeners, anti-loop)', async () => {
    let listenerRemoveCalls = 0;
    let capturedQrOptions = null;
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
        return { key: { id: `sent_${sentSockets.length}` } };
      },
    };
    const origRemoveAll = mockSock.ev.removeAllListeners.bind(mockSock.ev);
    mockSock.ev.removeAllListeners = (...args) => {
      listenerRemoveCalls += 1;
      return origRemoveAll(...args);
    };

    const failingVoice = {
      async transcribe() {
        return {
          ok: false,
          text: '',
          provider: 'none',
          fallbackMessage: VoiceAdapter.FALLBACK_STT_MESSAGE,
        };
      },
    };

    const baileysAdapter = new WhatsAppBaileysAdapter({
      voiceAdapter: failingVoice,
      baileysLoader: () => ({
        makeWASocket: (cfg) => {
          assert.equal(cfg.syncFullHistory, false);
          assert.equal(cfg.shouldSyncHistoryMessage(), false);
          return mockSock;
        },
        useMultiFileAuthState: async () => ({
          state: { creds: {}, keys: {} },
          saveCreds: async () => {},
        }),
        DisconnectReason: { loggedOut: 401 },
        Browsers: { ubuntu: (b) => ['Ubuntu', b, '22.04'] },
        downloadMediaMessage: async () => Buffer.from('ogg-bytes'),
      }),
      qrCodeLoader: () => ({
        async toDataURL(qr, opts) {
          capturedQrOptions = opts;
          return `data:image/png;base64,${Buffer.from(qr).toString('base64')}`;
        },
      }),
    });

    const fx = createMessagingFixture({
      channelAdapter: baileysAdapter,
      debounceWindowMs: 20,
    });
    baileysAdapter.authDirResolver = (sk) =>
      fx.sessionManager.resolveSessionPaths(sk).authDir;
    baileysAdapter.partnerIdResolver = () => fx.partner.id;
    fx.sessionManager.bindInboundPipeline();

    try {
      await fx.sessionManager.connectSession('usr_1', 'line_1');
      const sessionKey = 'pme:usr_1:line_1';

      // QR event uses pure #000000 foreground on #FFFFFF
      mockSock.ev.emit('connection.update', { qr: 'RAW_QR_DATA' });
      await new Promise((r) => setTimeout(r, 15));
      const qr = await baileysAdapter.getQr(sessionKey);
      assert.ok(qr.qrBase64.startsWith('data:image/png;base64,'));
      assert.equal(capturedQrOptions.color.dark, '#000000');
      assert.equal(capturedQrOptions.color.light, '#FFFFFF');
      assert.equal(capturedQrOptions.margin, 4);
      assert.equal(capturedQrOptions.scale, 8);

      mockSock.ev.emit('connection.update', { connection: 'open' });
      assert.equal(await baileysAdapter.getStatus(sessionKey), 'CONNECTED');

      // Anti-loop ignores fromMe: true and own bot number
      await mockSock.ev.emit('messages.upsert', {
        type: 'notify',
        messages: [
          {
            key: { id: 'self-1', fromMe: true, remoteJid: '5511999990009@s.whatsapp.net' },
            message: { conversation: 'Ignorar fromMe' },
          },
          {
            key: { id: 'own-2', fromMe: false, remoteJid: '5511000000000@s.whatsapp.net' },
            message: { conversation: 'Ignorar próprio número' },
          },
        ],
      });
      assert.equal(fx.queueRepo.fetchDueOutbox().length, 0);

      // Audio message where VoiceAdapter fails -> polite fallback queued & delivered (NOT silent drop)
      mockSock.ev.emit('messages.upsert', {
        type: 'notify',
        messages: [
          {
            key: { id: 'aud-1', fromMe: false, remoteJid: '5511999990010@s.whatsapp.net' },
            pushName: 'Clara',
            message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } },
          },
        ],
      });
      await new Promise((r) => setTimeout(r, 25));

      const outboxRes = await fx.outboxWorker.processOnce();
      assert.equal(outboxRes.sent, 1);
      assert.equal(sentSockets.length, 1);
      assert.equal(sentSockets[0].jid, '5511999990010@s.whatsapp.net');
      assert.equal(sentSockets[0].content.text, VoiceAdapter.FALLBACK_STT_MESSAGE);

      // Disconnect cleans listeners via removeAllListeners()
      await fx.sessionManager.disconnectSession(sessionKey);
      assert.ok(listenerRemoveCalls >= 1);
      assert.equal(await baileysAdapter.getStatus(sessionKey), 'DISCONNECTED');

      // 401 / device_removed wipes stale baileys_auth creds and stops reconnect loop
      const { authDir } = fx.sessionManager.resolveSessionPaths(sessionKey);
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(path.join(authDir, 'creds.json'), '{"me":{"id":"old"}}');
      fs.writeFileSync(path.join(authDir, 'active_context.json'), '{"keep":true}');
      await fx.sessionManager.connectSession('usr_1', 'line_1');
      mockSock.ev.emit('connection.update', {
        connection: 'close',
        lastDisconnect: {
          error: Object.assign(new Error('Stream Errored (conflict)'), {
            output: { statusCode: 401 },
          }),
        },
      });
      await new Promise((r) => setTimeout(r, 15));
      assert.equal(await baileysAdapter.getStatus(sessionKey), 'DISCONNECTED');
      assert.equal(fs.existsSync(path.join(authDir, 'creds.json')), false);
      assert.equal(fs.existsSync(path.join(authDir, 'active_context.json')), true);

      // Persisted creds.json is restored automatically after restart
      fs.writeFileSync(path.join(authDir, 'creds.json'), '{"me":{"id":"restored"}}');
      const restored = await fx.sessionManager.restorePersistedSessions();
      assert.ok(restored.includes(sessionKey));
      mockSock.ev.emit('connection.update', { connection: 'open' });
      assert.equal(await baileysAdapter.getStatus(sessionKey), 'CONNECTED');
    } finally {
      await fx.cleanup();
    }
  });

  test('6. QR refs attempts ended -> STANDBY sem loop de reconexão', async () => {
    let makeSocketCalls = 0;
    const mockSock = {
      user: null,
      ev: new EventEmitter(),
      ws: { close() {} },
      end() {},
    };

    const adapter = new WhatsAppBaileysAdapter({
      retryDelays: [10, 10],
      baileysLoader: () => ({
        makeWASocket: () => {
          makeSocketCalls += 1;
          return mockSock;
        },
        useMultiFileAuthState: async () => ({
          state: { creds: {}, keys: {} },
          saveCreds: async () => {},
        }),
        DisconnectReason: { loggedOut: 401 },
        Browsers: { ubuntu: (b) => ['Ubuntu', b, '22.04'] },
      }),
      qrCodeLoader: () => ({
        async toDataURL(qr) {
          return `data:image/png;base64,${Buffer.from(qr).toString('base64')}`;
        },
      }),
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-l4-qr-'));
    adapter.authDirResolver = (sk) => path.join(tmpDir, sk.replace(/:/g, '_'));

    try {
      const sessionKey = 'pme:usr_1';
      await adapter.connect(sessionKey);
      assert.equal(makeSocketCalls, 1);

      mockSock.ev.emit('connection.update', { qr: 'QR_1' });
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(await adapter.getStatus(sessionKey), 'PAIRING_READY');
      assert.ok(await adapter.getQr(sessionKey));

      // Exhaust QR attempts
      mockSock.ev.emit('connection.update', {
        connection: 'close',
        lastDisconnect: {
          error: new Error('QR refs attempts ended'),
        },
      });
      await new Promise((r) => setTimeout(r, 40));

      assert.equal(await adapter.getStatus(sessionKey), 'STANDBY');
      assert.equal(await adapter.getQr(sessionKey), null);
      assert.equal(makeSocketCalls, 1, 'Must NOT auto-reconnect once in STANDBY');

      const diag = adapter.getSessionDiagnostics(sessionKey);
      assert.equal(diag.status, 'STANDBY');
      assert.equal(diag.hasQr, false);
      assert.ok(typeof diag.lastEventTime === 'number');
    } finally {
      await adapter.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('7. Bad MAC purga credenciais do authDir preservando metadados e agenda reconexão limpa', async () => {
    let makeSocketCalls = 0;
    const mockSocks = [];

    const adapter = new WhatsAppBaileysAdapter({
      baileysLoader: () => ({
        makeWASocket: () => {
          makeSocketCalls += 1;
          const sock = {
            user: null,
            ev: new EventEmitter(),
            ws: { close() {} },
            end() {},
          };
          mockSocks.push(sock);
          return sock;
        },
        useMultiFileAuthState: async () => ({
          state: { creds: {}, keys: {} },
          saveCreds: async () => {},
        }),
        DisconnectReason: { loggedOut: 401 },
        Browsers: { ubuntu: (b) => ['Ubuntu', b, '22.04'] },
      }),
      qrCodeLoader: () => ({
        async toDataURL(qr) {
          return `data:image/png;base64,${Buffer.from(qr).toString('base64')}`;
        },
      }),
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-l4-badmac-'));
    const authDir = path.join(tmpDir, 'pme_usr_1', 'baileys_auth');
    adapter.authDirResolver = () => authDir;

    try {
      const sessionKey = 'pme:usr_1';
      await adapter.connect(sessionKey);
      fs.writeFileSync(path.join(authDir, 'creds.json'), '{"bad":true}');
      fs.writeFileSync(path.join(authDir, 'app-state-sync-key.json'), '{"bad":true}');
      fs.writeFileSync(path.join(authDir, 'session.json'), '{"keep":true}');
      fs.writeFileSync(path.join(authDir, 'active_context.json'), '{"keep":true}');

      mockSocks[0].ev.emit('connection.update', {
        connection: 'close',
        lastDisconnect: {
          error: new Error('Bad MAC Error: Decryption failed'),
        },
      });
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(await adapter.getStatus(sessionKey), 'RECONNECTING');
      assert.equal(fs.existsSync(path.join(authDir, 'creds.json')), false);
      assert.equal(fs.existsSync(path.join(authDir, 'app-state-sync-key.json')), false);
      assert.equal(fs.existsSync(path.join(authDir, 'session.json')), true);
      assert.equal(fs.existsSync(path.join(authDir, 'active_context.json')), true);

      // Clean restart scheduled in 2s; closing adapter cancels timer cleanly
      assert.equal(makeSocketCalls, 1);
      await adapter.disconnect(sessionKey);
      assert.equal(await adapter.getStatus(sessionKey), 'DISCONNECTED');
    } finally {
      await adapter.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('8. forceResetPairing protege contra concorrência e waitForQr resolve ao chegar QR', async () => {
    let makeSocketCalls = 0;
    let currentSock = null;

    const adapter = new WhatsAppBaileysAdapter({
      baileysLoader: () => ({
        makeWASocket: () => {
          makeSocketCalls += 1;
          currentSock = {
            user: { id: '5511988887777:2@s.whatsapp.net' },
            ev: new EventEmitter(),
            ws: { close() {} },
            end() {},
          };
          return currentSock;
        },
        useMultiFileAuthState: async () => {
          await new Promise((r) => setTimeout(r, 20));
          return {
            state: { creds: {}, keys: {} },
            saveCreds: async () => {},
          };
        },
        DisconnectReason: { loggedOut: 401 },
        Browsers: { ubuntu: (b) => ['Ubuntu', b, '22.04'] },
      }),
      qrCodeLoader: () => ({
        async toDataURL(qr) {
          return `data:image/png;base64,${Buffer.from(qr).toString('base64')}`;
        },
      }),
    });

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonmax-l4-reset-'));
    const authDir = path.join(tmpDir, 'pme_usr_1', 'baileys_auth');
    adapter.authDirResolver = () => authDir;

    try {
      const sessionKey = 'pme:usr_1';
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(path.join(authDir, 'creds.json'), '{"old":true}');

      // Concurrent forceResetPairing calls: only first executes
      const [r1, r2] = await Promise.all([
        adapter.forceResetPairing(sessionKey),
        adapter.forceResetPairing(sessionKey),
      ]);
      assert.equal(r1.ok, true);
      assert.equal(r2.inProgress, true);
      assert.equal(makeSocketCalls, 1);
      assert.equal(fs.existsSync(path.join(authDir, 'creds.json')), false);

      // waitForQr resolves as soon as QR arrives
      const waitPromise = adapter.waitForQr(sessionKey, { timeoutMs: 2000, pollMs: 15 });
      setTimeout(() => {
        currentSock.ev.emit('connection.update', { qr: 'NEW_PAIRING_QR' });
      }, 30);
      const waitRes = await waitPromise;

      assert.equal(waitRes.timedOut, false);
      assert.equal(waitRes.status, 'PAIRING_READY');
      assert.equal(waitRes.rawText, 'NEW_PAIRING_QR');
      assert.ok(waitRes.qrBase64.startsWith('data:image/png;base64,'));

      // forceReconnect preserves creds.json
      fs.writeFileSync(path.join(authDir, 'creds.json'), '{"keep":true}');
      await adapter.forceReconnect(sessionKey);
      assert.equal(fs.existsSync(path.join(authDir, 'creds.json')), true);
      assert.equal(makeSocketCalls, 2);

      currentSock.ev.emit('connection.update', { connection: 'open' });
      const diag = adapter.getSessionDiagnostics(sessionKey);
      assert.equal(diag.status, 'CONNECTED');
      assert.equal(diag.phoneNumber, '5511988887777');
    } finally {
      await adapter.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('9. Soft-Pause Global via SQLite (partners.is_active = 0) mantém socket, bloqueia AgentEngine e acumula contexto', async () => {
    let agentCalls = 0;
    let lastAgentInput = '';
    const mockAgent = {
      async processTurn(params) {
        agentCalls += 1;
        lastAgentInput = params.message;
        return { ok: true, text: 'Max retomado!' };
      },
    };

    const fx = createMessagingFixture({
      agentEngine: mockAgent,
      debounceWindowMs: 20,
    });

    try {
      const sessionKey = 'pme:usr_1';
      await fx.sessionManager.connectSession(fx.partner.id);
      assert.equal(await fx.adapter.getStatus(sessionKey), 'CONNECTED');

      // Pause partner globally in SQLite (Hero Card toggle)
      fx.partnerRepo.update(fx.partner.id, { isActive: false });
      const pausedPartner = fx.partnerRepo.findById(fx.partner.id);
      assert.equal(pausedPartner.is_active, 0);

      const chatId = '5511977776666@s.whatsapp.net';
      const res1 = await fx.sessionManager.handleIncomingEvent({
        eventKey: 'wa:global-pause-1',
        msgId: 'global-pause-1',
        sessionKey,
        partnerId: fx.partner.id,
        channel: 'whatsapp',
        chatId,
        pushName: 'Marcos',
        text: 'Oi, quero remarcar para terça.',
      });

      assert.equal(res1.paused, true);
      assert.equal(res1.globalPaused, true);
      assert.equal(agentCalls, 0);
      assert.equal(await fx.adapter.getStatus(sessionKey), 'CONNECTED');
      assert.equal(fx.queueRepo.isEventProcessed('wa:global-pause-1'), true);

      const conv = fx.conversationRepo.findByExternalChat(
        fx.partner.id,
        'whatsapp',
        chatId
      );
      assert.equal(conv.paused_context.length, 1);
      assert.equal(conv.paused_context[0].text, 'Oi, quero remarcar para terça.');

      // Reactivate partner in SQLite -> next message resumes with accumulated context
      fx.partnerRepo.update(fx.partner.id, { isActive: true });
      const res2 = await fx.sessionManager.handleIncomingEvent({
        eventKey: 'wa:global-resume-2',
        msgId: 'global-resume-2',
        sessionKey,
        partnerId: fx.partner.id,
        channel: 'whatsapp',
        chatId,
        text: 'Tem horário às 15h?',
      });

      assert.equal(res2.ok, true);
      assert.equal(agentCalls, 1);
      assert.match(lastAgentInput, /remarcar para terça/);
      assert.match(lastAgentInput, /Tem horário às 15h/);
    } finally {
      await fx.cleanup();
    }
  });

  test('10. Auto-Reconexão no Boot (restorePersistedSessions): valida creds.json, ignora corrompido e restaura parceiro em Soft-Pause Global', async () => {
    const fx = createMessagingFixture();

    try {
      // Cria segundo parceiro com Soft-Pause Global ativo (is_active = 0)
      const pausedPartner = fx.partnerRepo.create({
        id: 'usr_paused',
        email: 'paused@autonmax.dev',
        displayName: 'Loja Pausada',
        isActive: false,
      });

      // 1. Sessão válida do parceiro em Soft-Pause Global -> deve restaurar socket
      const pausedPaths = fx.sessionManager.resolveSessionPaths(`pme:${pausedPartner.id}`);
      fs.mkdirSync(pausedPaths.authDir, { recursive: true });
      fs.writeFileSync(
        path.join(pausedPaths.authDir, 'creds.json'),
        JSON.stringify({ me: { id: '5511999990001:1@s.whatsapp.net' } })
      );

      // 2. Sessão com creds.json corrompido/vazio -> deve ser ignorada
      const brokenPaths = fx.sessionManager.resolveSessionPaths(`pme:${fx.partner.id}:line_broken`);
      fs.mkdirSync(brokenPaths.authDir, { recursive: true });
      fs.writeFileSync(path.join(brokenPaths.authDir, 'creds.json'), '{}');

      // 3. Sessão válida com múltiplas linhas (inferida sem session.json) -> deve restaurar
      const line2Paths = fx.sessionManager.resolveSessionPaths(`pme:${fx.partner.id}:line_2`);
      fs.mkdirSync(line2Paths.authDir, { recursive: true });
      fs.writeFileSync(
        path.join(line2Paths.authDir, 'creds.json'),
        JSON.stringify({ noiseKey: { private: 'abc', public: 'def' } })
      );

      const restored = await fx.sessionManager.restorePersistedSessions();
      assert.equal(restored.includes(`pme:${pausedPartner.id}`), true);
      assert.equal(restored.includes(`pme:${fx.partner.id}:line_2`), true);
      assert.equal(restored.includes(`pme:${fx.partner.id}:line_broken`), false);
      assert.equal(await fx.adapter.getStatus(`pme:${pausedPartner.id}`), 'CONNECTED');
      assert.equal(await fx.adapter.getStatus(`pme:${fx.partner.id}:line_2`), 'CONNECTED');
    } finally {
      await fx.cleanup();
    }
  });

  test('11. SessionWatchdog executa soft-reconnect sem apagar creds.json, respeita STANDBY/backoff e para limpo via LifecycleManager', async () => {
    const reconnectCalls = [];
    class WatchdogAdapter extends MockChannelAdapter {
      async forceReconnect(sessionKey) {
        reconnectCalls.push(sessionKey);
        this.statuses.set(sessionKey, 'CONNECTED');
      }
    }

    const adapter = new WatchdogAdapter();
    const fx = createMessagingFixture({ channelAdapter: adapter });
    const lifecycle = new LifecycleManager({ drainTimeoutMs: 1000 });

    try {
      const entry = await fx.sessionManager.connectSession(fx.partner.id, 'default');
      const credsPath = path.join(entry.authDir, 'creds.json');
      fs.writeFileSync(credsPath, JSON.stringify({ me: { id: '5511888887777:1@s.whatsapp.net' } }));

      const watchdog = new SessionWatchdog({
        sessionManager: fx.sessionManager,
        intervalMs: 60_000,
        baseBackoffMs: 500,
        enabled: true,
      });
      lifecycle.register('session-watchdog', () => watchdog.stop());

      // Sessão em STANDBY não deve disparar reconnect
      adapter.statuses.set(entry.sessionKey, 'STANDBY');
      const standbyTick = await watchdog.tick();
      assert.equal(standbyTick.actions.length, 0);
      assert.equal(reconnectCalls.length, 0);

      // Sessão caiu para DISCONNECTED com creds.json válido -> soft reconnect sem wipe
      adapter.statuses.set(entry.sessionKey, 'DISCONNECTED');
      const recoverTick = await watchdog.tick();
      assert.equal(recoverTick.actions.length, 1);
      assert.equal(recoverTick.actions[0].action, 'soft_reconnect');
      assert.equal(reconnectCalls.length, 1);
      assert.equal(await adapter.getStatus(entry.sessionKey), 'CONNECTED');
      assert.equal(fs.existsSync(credsPath), true);

      // Start + shutdown limpo via LifecycleManager
      const startRes = watchdog.start();
      assert.equal(startRes.started, true);
      assert.equal(watchdog.getStatus().running, true);

      const shutdownRes = await lifecycle.shutdown('test-watchdog');
      assert.equal(shutdownRes.ok, true);
      assert.equal(watchdog.getStatus().running, false);
    } finally {
      await lifecycle.shutdown('finally');
      await fx.cleanup();
    }
  });
});
