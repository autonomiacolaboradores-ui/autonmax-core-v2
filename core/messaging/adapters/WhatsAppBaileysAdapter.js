'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ChannelAdapter } = require('../ChannelAdapter');
const { VoiceAdapter } = require('../../ai/voice/VoiceAdapter');

const DEFAULT_RETRY_DELAYS = Object.freeze([
  2000, 5000, 10000, 20000, 30000, 60000, 120000,
]);
const DEFAULT_STABILITY_RESET_MS = 120_000;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 12;

function defaultLoadBaileys() {
  return require('@whiskeysockets/baileys');
}

function defaultLoadQrCode() {
  return require('qrcode');
}

/**
 * Computes jittered exponential/stepped reconnect delay from retryDelays.
 * @param {number} attemptIndex
 * @param {readonly number[]} retryDelays
 * @returns {number}
 */
function computeBackoffDelay(attemptIndex, retryDelays = DEFAULT_RETRY_DELAYS) {
  const base = retryDelays[Math.min(attemptIndex, retryDelays.length - 1)] || 2000;
  const jitter = Math.floor(Math.random() * Math.min(1000, base * 0.2));
  return base + jitter;
}

/**
 * Extracts normalized digits from a WhatsApp JID (stripping device suffix `:NN`).
 * @param {string | null | undefined} jid
 * @returns {string}
 */
function extractJidDigits(jid) {
  return String(jid || '')
    .split('@')[0]
    .split(':')[0]
    .replace(/\D/g, '');
}

/**
 * WhatsApp Baileys ChannelAdapter:
 * - Preserves #000000 QR rendering, syncFullHistory: false, Browsers.ubuntu('Chrome'),
 *   anti-loop self-echo guards, stepped backoff without credential wipe, and 2-min stability reset.
 * - Cleans all socket event listeners via `ev.removeAllListeners()` before reconnect/disconnect.
 * - Delegates message idempotency to post-commit SQLite (`processed_events`) instead of premature memory sets.
 * - Routes audio messages through VoiceAdapter and emits polite fallback events on STT failure.
 */
class WhatsAppBaileysAdapter extends ChannelAdapter {
  /**
   * @param {{
   *   authDirResolver?: (sessionKey: string) => string,
   *   partnerIdResolver?: (sessionKey: string) => string | null,
   *   voiceAdapter?: VoiceAdapter,
   *   baileysLoader?: () => Record<string, any>,
   *   qrCodeLoader?: () => Record<string, any>,
   *   retryDelays?: number[],
   *   stabilityResetMs?: number,
   *   maxConsecutiveFailures?: number,
   *   onQrUpdate?: (payload: { sessionKey: string, qrBase64: string | null, rawQr: string | null, status: string }) => void,
   *   onConnectionChange?: (payload: { sessionKey: string, status: string, reason?: string }) => void,
   *   logger?: Console
   * }} [options]
   */
  constructor(options = {}) {
    super();
    this.authDirResolver = options.authDirResolver || null;
    this.partnerIdResolver = options.partnerIdResolver || null;
    this.voiceAdapter = options.voiceAdapter || null;
    this.baileysLoader = options.baileysLoader || defaultLoadBaileys;
    this.qrCodeLoader = options.qrCodeLoader || defaultLoadQrCode;
    this.retryDelays = Array.isArray(options.retryDelays)
      ? [...options.retryDelays]
      : [...DEFAULT_RETRY_DELAYS];
    this.stabilityResetMs = Number.isFinite(options.stabilityResetMs)
      ? Number(options.stabilityResetMs)
      : DEFAULT_STABILITY_RESET_MS;
    this.maxConsecutiveFailures = Number.isInteger(options.maxConsecutiveFailures)
      ? options.maxConsecutiveFailures
      : DEFAULT_MAX_CONSECUTIVE_FAILURES;
    this.onQrUpdate = options.onQrUpdate || null;
    this.onConnectionChange = options.onConnectionChange || null;
    this.logger = options.logger || console;

    /** @type {Map<string, Record<string, any>>} */
    this._sessions = new Map();
  }

  /**
   * Ensures a state container exists for `sessionKey`.
   * @private
   */
  _ensureState(sessionKey) {
    let st = this._sessions.get(sessionKey);
    if (!st) {
      st = {
        sessionKey,
        status: 'DISCONNECTED',
        sock: null,
        lastQrBase64: null,
        lastRawQr: null,
        retryCount: 0,
        reconnectAttempts: 0,
        isInitializing: false,
        stabilityTimer: null,
        reconnectTimer: null,
        recentSentTexts: new Set(),
        sentMsgIds: new Set(),
      };
      this._sessions.set(sessionKey, st);
    }
    return st;
  }

  /**
   * Clears all active timers and removes all Baileys socket listeners safely.
   * @private
   */
  _teardownSocket(st, reason) {
    if (st.stabilityTimer) {
      clearTimeout(st.stabilityTimer);
      st.stabilityTimer = null;
    }
    if (st.reconnectTimer) {
      clearTimeout(st.reconnectTimer);
      st.reconnectTimer = null;
    }
    if (st.sock) {
      try {
        if (st.sock.ev && typeof st.sock.ev.removeAllListeners === 'function') {
          st.sock.ev.removeAllListeners();
        }
      } catch {
        // Ignore listener cleanup errors.
      }
      try {
        if (st.sock.ws && typeof st.sock.ws.close === 'function') {
          st.sock.ws.close();
        }
      } catch {
        // Ignore ws close errors.
      }
      try {
        if (typeof st.sock.end === 'function') {
          st.sock.end(reason ? new Error(reason) : undefined);
        }
      } catch {
        // Ignore socket end errors.
      }
      st.sock = null;
    }
  }

  /**
   * Encodes QR string into high-contrast black (#000000) on white (#FFFFFF) PNG data URL.
   * @param {string} rawQr
   * @returns {Promise<string>}
   */
  async encodeQrDataUrl(rawQr) {
    const QRCode = this.qrCodeLoader();
    return QRCode.toDataURL(rawQr, {
      margin: 4,
      scale: 8,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
  }

  /**
   * Initializes Baileys socket for `sessionKey`.
   * @param {string} sessionKey
   */
  async connect(sessionKey) {
    const st = this._ensureState(sessionKey);
    if (st.isInitializing || st.status === 'CONNECTED' || st.status === 'STANDBY') {
      return;
    }

    st.isInitializing = true;
    const authDir = this.authDirResolver
      ? this.authDirResolver(sessionKey)
      : path.resolve(
          process.cwd(),
          'workspace',
          'sessions',
          String(sessionKey).replace(/[^a-zA-Z0-9_-]/g, '_'),
          'baileys_auth'
        );

    fs.mkdirSync(authDir, { recursive: true });

    try {
      // Teardown any stale socket & listeners before creating a fresh socket
      this._teardownSocket(st);

      const baileys = this.baileysLoader();
      const {
        makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        Browsers,
        downloadMediaMessage,
      } = baileys;

      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 90_000,
        keepAliveIntervalMs: 25_000,
        getMessage: async () => ({ conversation: '' }),
        browser: Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'],
      });

      st.sock = sock;

      sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
        } catch (err) {
          this.logger.warn?.(`[WA:${sessionKey}] saveCreds:`, err?.message);
        }
      });

      // Ignore bulk history sync events to conserve RAM (512MB Render limit)
      sock.ev.on('messaging-history.set', () => {});
      sock.ev.on('chats.set', () => {});
      sock.ev.on('contacts.set', () => {});
      sock.ev.on('messages.set', () => {});

      sock.ev.on('messages.upsert', async (upsert) => {
        if (!upsert || upsert.type !== 'notify' || !Array.isArray(upsert.messages)) {
          return;
        }
        for (const msg of upsert.messages) {
          await this._handleBaileysMessage(st, msg, downloadMediaMessage);
        }
      });

      sock.ev.on('connection.update', async (update) => {
        await this._handleConnectionUpdate(st, update, DisconnectReason, authDir);
      });
    } catch (err) {
      st.isInitializing = false;
      st.status = 'DISCONNECTED';
      throw err;
    }
  }

  /**
   * Normalizes and filters incoming Baileys message before emitting to Layer 4 pipeline.
   * @private
   */
  async _handleBaileysMessage(st, msg, downloadMediaMessage) {
    const remoteJid = msg?.key?.remoteJid || '';
    const msgId = msg?.key?.id || '';

    // 1. Anti-loop: ignore outbound / self-sent messages
    if (!msgId || msg?.key?.fromMe === true || st.sentMsgIds.has(msgId)) {
      return;
    }
    if (!remoteJid || remoteJid.includes('status@broadcast')) {
      return;
    }

    // 2. Anti-loop: ignore messages originating from the bot's own number
    const myNumber = extractJidDigits(st.sock?.user?.id);
    const senderNumber = extractJidDigits(msg?.key?.participant || remoteJid);
    if (myNumber && senderNumber && myNumber === senderNumber) {
      return;
    }

    let text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      '';
    let mediaType = 'text';
    let sttFailed = false;
    let fallbackMessage = null;

    // 3. Audio message transcription via VoiceAdapter (never silent-drop on failure)
    if (!text && msg.message?.audioMessage) {
      mediaType = 'audio';
      if (this.voiceAdapter && typeof downloadMediaMessage === 'function') {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { logger: this.logger }
          );
          const mimeType =
            msg.message.audioMessage.mimetype || 'audio/ogg; codecs=opus';
          const stt = await this.voiceAdapter.transcribe(buffer, mimeType);
          if (stt && stt.ok && stt.text) {
            text = stt.text;
          } else {
            sttFailed = true;
            fallbackMessage =
              stt?.fallbackMessage || VoiceAdapter.FALLBACK_STT_MESSAGE;
          }
        } catch {
          sttFailed = true;
          fallbackMessage = VoiceAdapter.FALLBACK_STT_MESSAGE;
        }
      } else {
        sttFailed = true;
        fallbackMessage = VoiceAdapter.FALLBACK_STT_MESSAGE;
      }
    }

    const trimmedText = String(text || '').trim();
    if (!trimmedText && !sttFailed) {
      return;
    }

    // 4. Anti-echo: drop exact matches of recently sent bot replies
    if (trimmedText) {
      const norm = trimmedText.toLowerCase().replace(/\s+/g, ' ');
      if (st.recentSentTexts.has(norm)) {
        return;
      }
    }

    const partnerId = this.partnerIdResolver
      ? this.partnerIdResolver(st.sessionKey)
      : null;

    await this._emitMessage({
      eventKey: `${st.sessionKey}:${msgId}`,
      msgId,
      sessionKey: st.sessionKey,
      partnerId,
      channel: 'whatsapp',
      chatId: remoteJid,
      senderId: msg.key?.participant || remoteJid,
      pushName: msg.pushName || null,
      text: trimmedText,
      mediaType,
      sttFailed,
      fallbackMessage,
      messageKey: msg.key,
      rawMessage: msg,
    });
  }

  /**
   * Handles QR updates, connection open stability reset, and stepped backoff reconnects.
   * @private
   */
  async _handleConnectionUpdate(st, update, DisconnectReason, authDir) {
    const { connection, lastDisconnect, qr } = update || {};

    if (qr && st.status !== 'STANDBY') {
      st.lastRawQr = qr;
      st.status = 'PAIRING_READY';
      try {
        st.lastQrBase64 = await this.encodeQrDataUrl(qr);
      } catch {
        st.lastQrBase64 = null;
      }
      this.onQrUpdate?.({
        sessionKey: st.sessionKey,
        qrBase64: st.lastQrBase64,
        rawQr: qr,
        status: st.status,
      });
      this.onConnectionChange?.({
        sessionKey: st.sessionKey,
        status: st.status,
      });
    }

    if (connection === 'open') {
      st.status = 'CONNECTED';
      st.isInitializing = false;
      st.lastQrBase64 = null;
      st.lastRawQr = null;
      st.retryCount = 0;

      if (st.stabilityTimer) clearTimeout(st.stabilityTimer);
      st.stabilityTimer = setTimeout(() => {
        st.reconnectAttempts = 0;
        st.retryCount = 0;
      }, this.stabilityResetMs);
      if (typeof st.stabilityTimer.unref === 'function') {
        st.stabilityTimer.unref();
      }

      this.onConnectionChange?.({
        sessionKey: st.sessionKey,
        status: 'CONNECTED',
      });
      return;
    }

    if (connection === 'close') {
      st.isInitializing = false;
      if (st.stabilityTimer) {
        clearTimeout(st.stabilityTimer);
        st.stabilityTimer = null;
      }

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const errMsg = String(
        lastDisconnect?.error?.message || lastDisconnect?.error || ''
      );
      const isLoggedOut =
        DisconnectReason && statusCode === DisconnectReason.loggedOut;
      const isQrExhausted = /QR refs attempts/i.test(errMsg);
      const isCorruptedSession =
        /Bad MAC|No matching sessions|Decryption failed/i.test(errMsg);

      this._teardownSocket(st);

      if (isQrExhausted || isLoggedOut) {
        st.status = isQrExhausted ? 'STANDBY' : 'DISCONNECTED';
        st.lastQrBase64 = null;
        st.lastRawQr = null;
        st.retryCount = 0;
        st.reconnectAttempts = 0;
        this.onQrUpdate?.({
          sessionKey: st.sessionKey,
          qrBase64: null,
          rawQr: null,
          status: st.status,
        });
        this.onConnectionChange?.({
          sessionKey: st.sessionKey,
          status: st.status,
          reason: errMsg,
        });
        return;
      }

      if (isCorruptedSession && fs.existsSync(authDir)) {
        for (const file of fs.readdirSync(authDir)) {
          if (file !== 'active_context.json') {
            fs.rmSync(path.join(authDir, file), { recursive: true, force: true });
          }
        }
        st.retryCount = 0;
        st.reconnectAttempts = 0;
      }

      if (st.reconnectAttempts >= this.maxConsecutiveFailures) {
        st.status = 'DISCONNECTED';
        this.onConnectionChange?.({
          sessionKey: st.sessionKey,
          status: 'DISCONNECTED',
          reason: 'MAX_RECONNECT_ATTEMPTS',
        });
        return;
      }

      st.status = 'RECONNECTING';
      const delayMs = computeBackoffDelay(st.retryCount, this.retryDelays);
      st.retryCount += 1;
      st.reconnectAttempts += 1;

      this.onConnectionChange?.({
        sessionKey: st.sessionKey,
        status: 'RECONNECTING',
        reason: errMsg,
      });

      st.reconnectTimer = setTimeout(() => {
        st.reconnectTimer = null;
        if (st.status !== 'STANDBY' && st.status !== 'DISCONNECTED') {
          this.connect(st.sessionKey).catch((err) => {
            this.logger.warn?.(`[WA:${st.sessionKey}] reconnect failed:`, err?.message);
          });
        }
      }, delayMs);
      if (typeof st.reconnectTimer.unref === 'function') {
        st.reconnectTimer.unref();
      }
    }
  }

  /**
   * Disconnects and cleans up listeners/timers for `sessionKey` (never wipes credentials).
   * @param {string} sessionKey
   */
  async disconnect(sessionKey) {
    const st = this._sessions.get(sessionKey);
    if (!st) return;

    st.status = 'DISCONNECTED';
    st.isInitializing = false;
    st.lastQrBase64 = null;
    st.lastRawQr = null;
    this._teardownSocket(st, 'SESSION_DISCONNECTED');
    this.onConnectionChange?.({
      sessionKey,
      status: 'DISCONNECTED',
      reason: 'MANUAL_DISCONNECT',
    });
  }

  /**
   * Returns current connection state for `sessionKey`.
   * @param {string} sessionKey
   */
  async getStatus(sessionKey) {
    const st = this._sessions.get(sessionKey);
    return st ? st.status : 'DISCONNECTED';
  }

  /**
   * Returns pairing QR payload if available.
   * @param {string} sessionKey
   */
  async getQr(sessionKey) {
    const st = this._sessions.get(sessionKey);
    if (!st || !st.lastQrBase64) return null;
    return {
      qrBase64: st.lastQrBase64,
      rawText: st.lastRawQr || '',
    };
  }

  /**
   * Marks messages as read when socket supports `readMessages`.
   * @param {string} sessionKey
   * @param {Array<Record<string, any>>} messageKeys
   */
  async markRead(sessionKey, messageKeys = []) {
    const st = this._sessions.get(sessionKey);
    if (!st?.sock || typeof st.sock.readMessages !== 'function') return;
    const valid = messageKeys.filter(Boolean);
    if (valid.length > 0) {
      await st.sock.readMessages(valid);
    }
  }

  /**
   * Sends presence (`composing`, `recording`, `paused`) on the active socket.
   * @param {string} sessionKey
   * @param {string} recipientId
   * @param {'composing' | 'recording' | 'paused'} state
   */
  async sendPresence(sessionKey, recipientId, state) {
    const st = this._sessions.get(sessionKey);
    if (!st?.sock || typeof st.sock.sendPresenceUpdate !== 'function') return;
    await st.sock.sendPresenceUpdate(state, recipientId);
  }

  /**
   * Dispatches a message through the active Baileys socket and records sent IDs for anti-loop.
   * @param {string} sessionKey
   * @param {string} recipientId
   * @param {{ text?: string, mediaUrl?: string, type?: 'text' | 'image' | 'audio' | 'document' }} payload
   */
  async sendMessage(sessionKey, recipientId, payload = {}) {
    const st = this._sessions.get(sessionKey);
    if (!st?.sock) {
      throw new Error(`WhatsApp socket not connected for session: ${sessionKey}`);
    }

    let content;
    const type = payload.type || 'text';
    if (type === 'image' && payload.mediaUrl) {
      content = { image: { url: payload.mediaUrl }, caption: payload.text || '' };
    } else if (type === 'audio' && payload.mediaUrl) {
      content = {
        audio: { url: payload.mediaUrl },
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
      };
    } else if (type === 'document' && payload.mediaUrl) {
      content = { document: { url: payload.mediaUrl }, caption: payload.text || '' };
    } else {
      content = { text: String(payload.text || '') };
    }

    const sent = await st.sock.sendMessage(recipientId, content);
    const messageId = sent?.key?.id || `wa_${crypto.randomUUID()}`;
    st.sentMsgIds.add(messageId);
    if (st.sentMsgIds.size > 1000) {
      st.sentMsgIds = new Set(Array.from(st.sentMsgIds).slice(-500));
    }

    if (payload.text) {
      const norm = String(payload.text).trim().toLowerCase().replace(/\s+/g, ' ');
      st.recentSentTexts.add(norm);
      if (st.recentSentTexts.size > 200) {
        st.recentSentTexts = new Set(Array.from(st.recentSentTexts).slice(-100));
      }
    }

    return {
      messageId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Disconnects all active sessions cleanly for LifecycleManager shutdown.
   */
  async close() {
    for (const sessionKey of Array.from(this._sessions.keys())) {
      await this.disconnect(sessionKey);
    }
    this._sessions.clear();
  }
}

WhatsAppBaileysAdapter.DEFAULT_RETRY_DELAYS = DEFAULT_RETRY_DELAYS;
WhatsAppBaileysAdapter.computeBackoffDelay = computeBackoffDelay;

module.exports = {
  WhatsAppBaileysAdapter,
  DEFAULT_RETRY_DELAYS,
  computeBackoffDelay,
};
