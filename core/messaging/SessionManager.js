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
 * Validates that a Baileys `creds.json` file exists and contains a non-empty JSON object.
 * Prevents spawning reconnect loops for empty or corrupted credential files.
 * @param {string} credsPath
 * @returns {boolean}
 */
function isValidCredsFile(credsPath) {
  if (!credsPath || !fs.existsSync(credsPath)) return false;
  try {
    const stat = fs.statSync(credsPath);
    if (!stat.isFile() || stat.size < 2) return false;
    const raw = fs.readFileSync(credsPath, 'utf8').trim();
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0);
  } catch {
    return false;
  }
}

/**
 * Extracts normalized WhatsApp phone/LID digits and mtime from a valid `creds.json` file
 * so `restorePersistedSessions()` can deduplicate multiple sessions bound to the same number.
 * @param {string} credsPath
 * @returns {{ phoneNumber: string | null, lidNumber: string | null, mtimeMs: number } | null}
 */
function readCredsIdentity(credsPath) {
  if (!credsPath || !fs.existsSync(credsPath)) return null;
  try {
    const stat = fs.statSync(credsPath);
    if (!stat.isFile() || stat.size < 2) return null;
    const raw = fs.readFileSync(credsPath, 'utf8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
      return null;
    }
    const toDigits = (jid) =>
      String(jid || '')
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '') || null;
    return {
      phoneNumber: toDigits(parsed?.me?.id),
      lidNumber: toDigits(parsed?.me?.lid),
      mtimeMs: Number(stat.mtimeMs || 0),
    };
  } catch {
    return null;
  }
}

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

    if (
      this.channelAdapter &&
      typeof this.channelAdapter === 'object' &&
      !this.channelAdapter.onSessionSuperseded
    ) {
      this.channelAdapter.onSessionSuperseded = ({ supersededSessionKey }) => {
        if (supersededSessionKey) {
          this._sessions.delete(supersededSessionKey);
        }
      };
    }

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
   * Validates that `partnerId` exists and is active (unless `allowPaused` is set for
   * Soft-Pause Global socket restoration) before creating/resolving a session.
   * @private
   */
  _authorizePartner(partnerId, options = {}) {
    const partner = this.partnerRepository.findById(partnerId);
    if (!partner) {
      const err = new Error(`PARTNER_NOT_FOUND: ${partnerId}`);
      err.code = 'PARTNER_NOT_FOUND';
      throw err;
    }
    if (!options.allowPaused && Number(partner.is_active) !== 1) {
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
   * @param {{ allowPaused?: boolean }} [options]
   */
  createOrGetSession(partnerId, lineId = 'default', options = {}) {
    this._authorizePartner(partnerId, options);
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
    try {
      const metaPath = path.join(sessionDir, 'session.json');
      let existingCreatedAt = null;
      if (fs.existsSync(metaPath)) {
        try {
          existingCreatedAt = JSON.parse(fs.readFileSync(metaPath, 'utf8'))?.createdAt || null;
        } catch {
          existingCreatedAt = null;
        }
      }
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            sessionKey,
            partnerId,
            lineId: String(lineId || 'default'),
            createdAt: existingCreatedAt || Date.now(),
          },
          null,
          2
        )
      );
    } catch {
      // Ignore metadata write failure on read-only paths
    }

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
   * @param {{ allowPaused?: boolean }} [options]
   */
  async connectSession(partnerId, lineId = 'default', options = {}) {
    const entry = this.createOrGetSession(partnerId, lineId, options);
    await this.channelAdapter.connect(entry.sessionKey);
    return entry;
  }

  /**
   * Forces a clean pairing reset (wiping credentials and generating a fresh QR)
   * for a partner session line.
   * @param {string} partnerId
   * @param {string} [lineId='default']
   */
  async forceResetSession(partnerId, lineId = 'default') {
    const entry = this.createOrGetSession(partnerId, lineId);
    if (typeof this.channelAdapter.forceResetPairing === 'function') {
      await this.channelAdapter.forceResetPairing(entry.sessionKey);
    } else {
      await this.disconnectSession(entry.sessionKey, { wipeAuth: true });
      await this.channelAdapter.connect(entry.sessionKey);
    }
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
   * Returns all currently registered session descriptors.
   */
  listRegisteredSessions() {
    return Array.from(this._sessions.values());
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

    // Soft-Pause (Global via partners.is_active === 0 OR per-conversation):
    // AI stays silent, WhatsApp socket stays live, messages recorded in SQLite JSON
    const partner = this.partnerRepository.findById(partnerId);
    const isGlobalPartnerPaused = Boolean(partner && Number(partner.is_active) === 0);
    const isConversationPaused = this.pauseController.isPaused({
      partnerId,
      conversationId: conversation.id,
    });

    if (isGlobalPartnerPaused || isConversationPaused) {
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
      console.log(
        `[SOFT_PAUSE] Suppressed AI reply partner=${partnerId} conv=${conversation.id} global=${isGlobalPartnerPaused} perConv=${isConversationPaused}`
      );
      return {
        ok: true,
        paused: true,
        globalPaused: isGlobalPartnerPaused,
        conversationId: conversation.id,
      };
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
   * Restores previously paired sessions (those with a valid `baileys_auth/creds.json`)
   * from `this.sessionsDir` after an app restart, including partners in Soft-Pause Global
   * so their WhatsApp socket stays online while AI remains silent.
   *
   * Deduplicates sessions bound to the exact same WhatsApp phoneNumber/LID so that if a
   * number was re-paired on a newer PME account, ONLY the most recently updated session
   * is restored (preventing duplicate replies and cross-account history leakage).
   * @returns {Promise<string[]>} Restored sessionKeys
   */
  async restorePersistedSessions() {
    if (!fs.existsSync(this.sessionsDir)) return [];
    const candidates = [];
    const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });
    for (const dirEntry of entries) {
      if (!dirEntry.isDirectory()) continue;
      const sessionDir = path.join(this.sessionsDir, dirEntry.name);
      const credsPath = path.join(sessionDir, 'baileys_auth', 'creds.json');
      const identity = readCredsIdentity(credsPath);
      if (!identity) continue;

      let meta = null;
      const metaPath = path.join(sessionDir, 'session.json');
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        } catch {
          meta = null;
        }
      }

      if (!meta?.partnerId && dirEntry.name.startsWith('pme_')) {
        const suffix = dirEntry.name.slice(4);
        const directPartner = this.partnerRepository.findById(suffix);
        if (directPartner) {
          meta = { partnerId: directPartner.id, lineId: 'default' };
        } else {
          const allPartners = this.partnerRepository.list();
          for (const candidate of allPartners) {
            const safePid = sanitizeNtfsName(candidate.id);
            if (suffix === safePid) {
              meta = { partnerId: candidate.id, lineId: 'default' };
              break;
            }
            if (suffix.startsWith(`${safePid}_`)) {
              const inferredLine = suffix.slice(safePid.length + 1) || 'default';
              meta = { partnerId: candidate.id, lineId: inferredLine };
              break;
            }
          }
        }
      }

      if (!meta?.partnerId) continue;

      let dirMtimeMs = identity.mtimeMs;
      let sessionCreatedAtMs = Number(meta.pairedAt || meta.createdAt || 0);
      try {
        if (!sessionCreatedAtMs && fs.existsSync(metaPath)) {
          const metaStat = fs.statSync(metaPath);
          sessionCreatedAtMs = Number(metaStat.birthtimeMs || metaStat.mtimeMs || 0);
        }
        const dirStat = fs.statSync(sessionDir);
        if (dirStat.mtimeMs > dirMtimeMs) dirMtimeMs = dirStat.mtimeMs;
      } catch {
        // Ignore stat error
      }

      const partnerRow = this.partnerRepository.findById(meta.partnerId);
      const partnerCreatedAtMs = partnerRow?.created_at
        ? Date.parse(String(partnerRow.created_at).replace(' ', 'T') + 'Z') || 0
        : 0;

      candidates.push({
        partnerId: meta.partnerId,
        lineId: meta.lineId || 'default',
        sessionKey: buildSessionKey(meta.partnerId, meta.lineId || 'default'),
        phoneNumber: identity.phoneNumber,
        lidNumber: identity.lidNumber,
        mtimeMs: identity.mtimeMs,
        dirMtimeMs,
        sessionCreatedAtMs,
        partnerCreatedAtMs,
      });
    }

    // Sort newest pairing / newest partner first so Baileys key rotations on an older partner
    // never hijack ownership from a more recently paired PME account.
    candidates.sort(
      (a, b) =>
        b.sessionCreatedAtMs - a.sessionCreatedAtMs ||
        b.partnerCreatedAtMs - a.partnerCreatedAtMs ||
        b.mtimeMs - a.mtimeMs ||
        b.dirMtimeMs - a.dirMtimeMs
    );

    const seenPhones = new Set();
    const seenLids = new Set();
    const restored = [];

    for (const item of candidates) {
      if (
        (item.phoneNumber && seenPhones.has(item.phoneNumber)) ||
        (item.lidNumber && seenLids.has(item.lidNumber))
      ) {
        console.warn(
          `[SESSION_MANAGER] Skipping superseded persisted session "${item.sessionKey}" (WhatsApp ${item.phoneNumber || item.lidNumber} already claimed by a newer partner session)`
        );
        continue;
      }

      try {
        const session = await this.connectSession(item.partnerId, item.lineId, {
          allowPaused: true,
        });
        if (item.phoneNumber) seenPhones.add(item.phoneNumber);
        if (item.lidNumber) seenLids.add(item.lidNumber);
        restored.push(session.sessionKey);
      } catch {
        // Ignore missing partners or transient startup errors
      }
    }
    return restored;
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
SessionManager.isValidCredsFile = isValidCredsFile;
SessionManager.readCredsIdentity = readCredsIdentity;

module.exports = {
  SessionManager,
  DEFAULT_MAX_LINES_PER_PARTNER,
  sanitizeNtfsName,
  buildSessionKey,
  parseSessionKey,
  isValidCredsFile,
  readCredsIdentity,
};
