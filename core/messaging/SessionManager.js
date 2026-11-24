'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseManager } = require('../storage/DatabaseManager');
const { PartnerRepository } = require('../storage/repositories/PartnerRepository');
const { CustomerRepository } = require('../storage/repositories/CustomerRepository');
const { ConversationRepository } = require('../storage/repositories/ConversationRepository');
const { QueueRepository } = require('../storage/repositories/QueueRepository');
const { VoiceAdapter } = require('../ai/voice/VoiceAdapter');
const { PauseController } = require('./PauseController');
const { MessageDebouncer } = require('./MessageDebouncer');
const { OutboundQueueWorker } = require('./OutboundQueueWorker');

const DEFAULT_MAX_LINES_PER_PARTNER = 2;

/**
 * Sanitizes a segment or full key strictly for Windows NTFS compatibility
 * (replaces `:` and non-alphanumeric chars with `_`, avoiding ADS path failures).
 * @param {string} raw
 * @returns {string}
 */
function sanitizeNtfsName(raw) {
  return DatabaseManager.sanitizeKey(String(raw || '').trim())
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 120);
}

/**
 * Normalizes a canonical sessionKey (`pme:{partnerId}:{lineId}` or `pme:{partnerId}`).
 * @param {string} partnerId
 * @param {string} [lineId='default']
 * @returns {string}
 */
function buildSessionKey(partnerId, lineId = 'default') {
  const pid = String(partnerId || '').trim();
  const lid = String(lineId || 'default').trim();
  if (!pid) {
    throw new Error('partnerId is required to build a sessionKey');
  }
  return lid === 'default' ? `pme:${pid}` : `pme:${pid}:${lid}`;
}

/**
 * Parses a sessionKey (`pme:usr_1:line_1` or `pme:usr_1`) into components.
 * @param {string} sessionKey
 * @returns {{ kind: string, partnerId: string, lineId: string, canonicalKey: string }}
 */
function parseSessionKey(sessionKey) {
  const parts = String(sessionKey || '').trim().split(':').filter(Boolean);
  if (parts.length === 0) {
    throw new Error('Invalid empty sessionKey');
  }
  if (parts[0] !== 'pme') {
    parts.unshift('pme');
  }
  const partnerId = parts[1] || 'default';
  const lineId = parts[2] || 'default';
  return {
    kind: 'pme',
    partnerId,
    lineId,
    canonicalKey: lineId === 'default' ? `pme:${partnerId}` : `pme:${partnerId}:${lineId}`,
  };
}

/**
 * Multi-session WhatsApp/omnichannel coordinator:
 * - Parameterizes storage root via `SESSIONS_DIR` (default `./workspace/sessions`)
 * - Enforces Windows NTFS-safe paths (`pme_usr_1_line_1`, zero `:`)
 * - Validates partner existence & active authorization before creating sessions
 * - Enforces `MAX_LINES_PER_PARTNER`
 * - Wires the resilient inbound pipeline: Soft-Pause -> Debouncer -> AgentEngine -> Post-Commit Outbox
 */
class SessionManager {
  /**
   * @param {{
   *   dbManager: DatabaseManager,
   *   sessionsDir?: string,
   *   rootDir?: string,
   *   maxLinesPerPartner?: number,
   *   channelAdapter: import('./ChannelAdapter').ChannelAdapter,
   *   agentEngine?: import('../ai/AgentEngine').AgentEngine,
   *   pauseController?: PauseController,
   *   debouncer?: MessageDebouncer,
   *   outboxWorker?: OutboundQueueWorker,
   *   partnerRepository?: PartnerRepository,
   *   customerRepository?: CustomerRepository,
   *   conversationRepository?: ConversationRepository,
   *   queueRepository?: QueueRepository
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.dbManager) {
      throw new Error('SessionManager requires dbManager');
    }
    if (!deps.channelAdapter) {
      throw new Error('SessionManager requires channelAdapter');
    }

    this.dbManager = deps.dbManager;
    this.sessionsDir = path.resolve(
      deps.sessionsDir ||
        deps.rootDir ||
        process.env.SESSIONS_DIR ||
        path.resolve(process.cwd(), 'workspace', 'sessions')
    );
    this.maxLinesPerPartner = Number.isInteger(deps.maxLinesPerPartner)
      ? deps.maxLinesPerPartner
      : Number(process.env.MAX_LINES_PER_PARTNER || DEFAULT_MAX_LINES_PER_PARTNER);

    this.channelAdapter = deps.channelAdapter;
    this.partnerRepository =
      deps.partnerRepository || new PartnerRepository(deps.dbManager);
    this.customerRepository =
      deps.customerRepository || new CustomerRepository(deps.dbManager);
    this.conversationRepository =
      deps.conversationRepository || new ConversationRepository(deps.dbManager);
    this.queueRepository =
      deps.queueRepository || new QueueRepository(deps.dbManager);

    this.pauseController =
      deps.pauseController ||
      new PauseController({ conversationRepository: this.conversationRepository });
    this.debouncer = deps.debouncer || new MessageDebouncer();
    this.outboxWorker =
      deps.outboxWorker ||
      new OutboundQueueWorker({
        queueRepository: this.queueRepository,
        channelAdapter: this.channelAdapter,
      });
    this.agentEngine = deps.agentEngine || null;

    /** @type {Map<string, { sessionKey: string, partnerId: string, lineId: string, authDir: string, sanitizedKey: string }>} */
    this._sessions = new Map();
    /** @type {Map<string, Array<{ resolve: Function, reject: Function }>>} */
    this._batchWaiters = new Map();
    this._unsubscribeAdapter = null;

    fs.mkdirSync(this.sessionsDir, { recursive: true });
  }

  /**
   * Resolves a Windows NTFS-safe credential directory inside `this.sessionsDir`
   * (guaranteed free of `:` characters in all relative segments).
   * @param {string} sessionKey
   * @returns {{ sanitizedKey: string, sessionDir: string, authDir: string }}
   */
  resolveSessionPaths(sessionKey) {
    const parsed = parseSessionKey(sessionKey);
    const sanitizedKey = sanitizeNtfsName(parsed.canonicalKey);
    const sessionDir = path.join(this.sessionsDir, sanitizedKey);
    const authDir = path.join(sessionDir, 'baileys_auth');
    return { sanitizedKey, sessionDir, authDir };
  }

  /**
   * Validates that `partnerId` exists and is active before creating/resolving a session.
   * @private
   */
  _authorizePartner(partnerId) {
    const partner = this.partnerRepository.findById(partnerId);
    if (!partner) {
      const err = new Error(`PARTNER_NOT_FOUND: ${partnerId}`);
      err.code = 'PARTNER_NOT_FOUND';
      throw err;
    }
    if (Number(partner.is_active) !== 1) {
      const err = new Error(`PARTNER_INACTIVE: ${partnerId}`);
      err.code = 'PARTNER_INACTIVE';
      throw err;
    }
    return partner;
  }

  /**
   * Registers/creates an isolated session line for an authorized partner,
   * enforcing `MAX_LINES_PER_PARTNER` and NTFS path safety.
   * @param {string} partnerId
   * @param {string} [lineId='default']
   */
  createOrGetSession(partnerId, lineId = 'default') {
    this._authorizePartner(partnerId);
    const sessionKey = buildSessionKey(partnerId, lineId);

    if (this._sessions.has(sessionKey)) {
      return this._sessions.get(sessionKey);
    }

    const existingLines = this.listPartnerSessions(partnerId);
    if (existingLines.length >= this.maxLinesPerPartner) {
      const err = new Error(
        `MAX_LINES_EXCEEDED: partner "${partnerId}" reached limit (${this.maxLinesPerPartner})`
      );
      err.code = 'MAX_LINES_EXCEEDED';
      err.max = this.maxLinesPerPartner;
      throw err;
    }

    const { sanitizedKey, sessionDir, authDir } = this.resolveSessionPaths(sessionKey);
    fs.mkdirSync(authDir, { recursive: true });

    const entry = {
      sessionKey,
      sanitizedKey,
      partnerId,
      lineId: String(lineId || 'default'),
      sessionDir,
      authDir,
    };
    this._sessions.set(sessionKey, entry);
    return entry;
  }

  /**
   * Connects a session via ChannelAdapter after partner authorization.
   * @param {string} partnerId
   * @param {string} [lineId='default']
   */
  async connectSession(partnerId, lineId = 'default') {
    const entry = this.createOrGetSession(partnerId, lineId);
    await this.channelAdapter.connect(entry.sessionKey);
    return entry;
  }

  /**
   * Disconnects a session and optionally wipes only its own authDir inside `sessionsDir`.
   * @param {string} sessionKey
   * @param {{ wipeAuth?: boolean }} [options]
   */
  async disconnectSession(sessionKey, options = {}) {
    const { canonicalKey } = parseSessionKey(sessionKey);
    await this.channelAdapter.disconnect(canonicalKey);
    const entry = this._sessions.get(canonicalKey);

    if (options.wipeAuth && entry) {
      const root = path.resolve(this.sessionsDir);
      const target = path.resolve(entry.authDir);
      if (target.startsWith(root + path.sep)) {
        fs.rmSync(target, { recursive: true, force: true });
        fs.mkdirSync(target, { recursive: true });
      }
    }
  }

  /**
   * Lists registered sessions for a given partner.
   * @param {string} partnerId
   */
  listPartnerSessions(partnerId) {
    const out = [];
    for (const entry of this._sessions.values()) {
      if (entry.partnerId === partnerId) {
        out.push(entry);
      }
    }
    return out;
  }

  /**
   * Lists all registered sessions with live ChannelAdapter status.
   */
  async listSessionsWithStatus() {
    const list = [];
    for (const entry of this._sessions.values()) {
      const status = await this.channelAdapter.getStatus(entry.sessionKey);
      list.push({ ...entry, status });
    }
    return list;
  }

  /**
   * Attaches the inbound message pipeline to `this.channelAdapter.onMessage`.
   */
  bindInboundPipeline() {
    if (this._unsubscribeAdapter) return this._unsubscribeAdapter;
    this._unsubscribeAdapter = this.channelAdapter.onMessage((event) =>
      this.handleIncomingEvent(event)
    );
    return this._unsubscribeAdapter;
  }

  /**
   * Processes one normalized inbound ChannelAdapter event through:
   * 1. Pre-check SQLite `processed_events` idempotency
   * 2. Customer + Conversation persistence
   * 3. Audio STT fallback or Soft-Pause context buffering
   * 4. MessageDebouncer consolidation -> AgentEngine -> atomic post-commit `processed_events` + `outbox_queue`
   * @param {Record<string, any>} event
   */
  async handleIncomingEvent(event) {
    const sessionKey = String(event.sessionKey || '');
    const parsed = sessionKey ? parseSessionKey(sessionKey) : null;
    const partnerId = event.partnerId || parsed?.partnerId;
    const channel = String(event.channel || 'whatsapp');
    const chatId = String(event.chatId || '');
    const eventKey = String(event.eventKey || `${sessionKey}:${event.msgId || ''}`);

    if (!partnerId || !chatId) {
      throw new Error('Inbound event requires partnerId and chatId');
    }

    if (eventKey && this.queueRepository.isEventProcessed(eventKey)) {
      return { ok: true, duplicate: true };
    }

    const customer = this.customerRepository.upsert({
      partnerId,
      channel,
      externalId: chatId,
      name: event.pushName || null,
    });

    const conversation = this.conversationRepository.upsertConversation({
      partnerId,
      customerId: customer.id,
      channel,
      externalChatId: chatId,
    });

    // Soft-Pause: AI stays silent, conversation remains live, messages recorded in SQLite JSON
    if (this.pauseController.isPaused({ partnerId, conversationId: conversation.id })) {
      const pauseText = event.sttFailed
        ? '[áudio não transcrito]'
        : String(event.text || '').trim();
      if (pauseText) {
        this.pauseController.recordPausedMessage({
          partnerId,
          conversationId: conversation.id,
          role: 'customer',
          text: pauseText,
        });
      }
      if (eventKey) {
        this.queueRepository.markEventProcessed(eventKey, sessionKey);
      }
      return { ok: true, paused: true, conversationId: conversation.id };
    }

    // Audio STT failed: never silent-drop — enqueue polite fallback response immediately
    if (event.sttFailed) {
      const fallbackText =
        event.fallbackMessage || VoiceAdapter.FALLBACK_STT_MESSAGE;
      const enqueued = this.queueRepository.enqueueWithIdempotency({
        eventKey,
        sessionKey,
        channel,
        recipientId: chatId,
        payload: {
          type: 'text',
          text: fallbackText,
          readReceiptKey: event.messageKey || null,
          sttFallback: true,
        },
      });
      return {
        ok: true,
        sttFallback: true,
        enqueued: enqueued.enqueued,
        outbox: enqueued.outbox,
      };
    }

    // Debounce fragmented messages by (partnerId, chatId)
    const batchKey = MessageDebouncer.makeKey(partnerId, chatId);
    return new Promise((resolve, reject) => {
      let waiters = this._batchWaiters.get(batchKey);
      if (!waiters) {
        waiters = [];
        this._batchWaiters.set(batchKey, waiters);
      }
      waiters.push({ resolve, reject });

      const accepted = this.debouncer.enqueue(
        {
          partnerId,
          chatId,
          text: event.text,
          eventKey,
          sessionKey,
          channel,
          customerId: customer.id,
          customerPhone: customer.phone,
          clientName: customer.name || event.pushName || 'Cliente',
          conversationId: conversation.id,
          messageKey: event.messageKey || null,
        },
        async (batch) => {
          const batchWaiters = this._batchWaiters.get(batchKey) || [];
          this._batchWaiters.delete(batchKey);
          try {
            const result = await this._processConsolidatedBatch(batch);
            for (const w of batchWaiters) w.resolve(result);
          } catch (err) {
            for (const w of batchWaiters) w.reject(err);
          }
        }
      );

      if (!accepted.accepted) {
        this._batchWaiters.delete(batchKey);
        for (const w of waiters) w.resolve({ ok: false, reason: 'DEBOUNCER_CLOSED' });
      }
    });
  }

  /**
   * Executes AgentEngine on a consolidated debounced batch and performs
   * atomic post-commit persistence of `processed_events` + `outbox_queue`.
   * If AgentEngine throws, NO eventKeys are recorded in `processed_events`.
   * @private
   */
  async _processConsolidatedBatch(batch) {
    if (!this.agentEngine) {
      throw new Error('SessionManager requires agentEngine to process inbound batches');
    }

    const first = batch.items[0] || {};
    const pauseFact = this.pauseController.consumePausedContextFact({
      partnerId: batch.partnerId,
      conversationId: first.conversationId,
      clear: true,
    });

    const inputText = pauseFact ? `${pauseFact}\n\n${batch.text}` : batch.text;

    const turnResult = await this.agentEngine.processTurn({
      partnerId: batch.partnerId,
      conversationId: first.conversationId,
      customerId: first.customerId,
      customerPhone: first.customerPhone,
      clientName: first.clientName,
      message: inputText,
    });

    const replyText = String(turnResult?.text || '').trim();
    const eventKeys = batch.eventKeys.length > 0 ? batch.eventKeys : [];
    const sessionKey = first.sessionKey || `pme:${batch.partnerId}`;
    const channel = first.channel || 'whatsapp';

    // Post-commit atomic SQLite persistence: processed_events + outbox_queue
    const outbox = this.dbManager.transaction(() => {
      for (const ek of eventKeys) {
        const inserted = this.queueRepository.markEventProcessed(ek, sessionKey);
        if (!inserted && eventKeys.length === 1) {
          return null;
        }
      }

      if (!replyText) {
        return null;
      }

      return this.queueRepository.enqueueOutbox({
        sessionKey,
        channel,
        recipientId: batch.chatId,
        payload: {
          type: 'text',
          text: replyText,
          readReceiptKey: first.messageKey || null,
        },
      });
    });

    return {
      ok: true,
      turnResult,
      outbox,
      consolidatedCount: batch.count,
    };
  }

  /**
   * Graceful shutdown hook compatible with LifecycleManager:
   * stops debouncer, drains outbox worker, unbinds adapter, and closes sessions.
   */
  async close() {
    if (this._unsubscribeAdapter) {
      this._unsubscribeAdapter();
      this._unsubscribeAdapter = null;
    }
    await this.debouncer.close({ flushPending: false });
    await this.outboxWorker.stop();
    if (typeof this.channelAdapter.close === 'function') {
      await this.channelAdapter.close();
    } else {
      for (const key of Array.from(this._sessions.keys())) {
        await this.channelAdapter.disconnect(key).catch(() => {});
      }
    }
    this._sessions.clear();
  }
}

SessionManager.DEFAULT_MAX_LINES_PER_PARTNER = DEFAULT_MAX_LINES_PER_PARTNER;
SessionManager.sanitizeNtfsName = sanitizeNtfsName;
SessionManager.buildSessionKey = buildSessionKey;
SessionManager.parseSessionKey = parseSessionKey;

module.exports = {
  SessionManager,
  DEFAULT_MAX_LINES_PER_PARTNER,
  sanitizeNtfsName,
  buildSessionKey,
  parseSessionKey,
};
