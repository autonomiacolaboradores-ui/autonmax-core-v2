/**
 * MAX.WhatsApp Engine — AUTON.MAX v2.0 (Block 11)
 * Gateway despachante WhatsApp + Anti-Loop handover
 * RFC-A111: FDU PARTNER APP — B2B
 */

'use strict';

const { EventEmitter } = require('events');
const crypto = require('crypto');

class WhatsAppEngine extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {object} [opts.orchestrator] - optional MaxOrchestrator stub
   * @param {number} [opts.antiLoopThreshold=5]
   */
  constructor(opts = {}) {
    super();
    this.orchestrator = opts.orchestrator || null;
    this.antiLoopThreshold = opts.antiLoopThreshold ?? 5;
    /** sessionId → { failures, locked, lastMessage } */
    this._sessions = new Map();
    this._outbound = [];
  }

  /**
   * Process inbound WhatsApp webhook payload.
   * @param {object} messagePayload
   * @returns {{ sessionId, handled, locked, reply? }}
   */
  processIncomingMessage(messagePayload) {
    const sessionId =
      messagePayload.sessionId ||
      messagePayload.from ||
      crypto.randomUUID();

    let session = this._sessions.get(sessionId);
    if (!session) {
      session = { failures: 0, locked: false, lastMessage: null, cart: [] };
      this._sessions.set(sessionId, session);
    }

    if (session.locked) {
      this.emit('anti_loop_blocked', { sessionId, message: messagePayload });
      return { sessionId, handled: false, locked: true };
    }

    session.lastMessage = messagePayload;

    // Dispatch to orchestrator if present
    let reply = null;
    if (this.orchestrator && typeof this.orchestrator.handle === 'function') {
      try {
        const result = this.orchestrator.handle(messagePayload, session);
        if (result && result.success) {
          session.failures = 0;
          reply = result.reply;
          if (reply) this.sendMessage(sessionId, reply);
        } else {
          session.failures += 1;
          if (session.failures >= this.antiLoopThreshold) {
            return this.handleAntiLoopTrigger(sessionId);
          }
        }
      } catch {
        session.failures += 1;
        if (session.failures >= this.antiLoopThreshold) {
          return this.handleAntiLoopTrigger(sessionId);
        }
      }
    } else {
      // Default echo path for tests without orchestrator
      reply = { type: 'text', body: 'Recebido. Como posso ajudar?' };
      this.sendMessage(sessionId, reply);
    }

    this.emit('message_processed', { sessionId, messagePayload, reply });
    return { sessionId, handled: true, locked: false, reply };
  }

  /**
   * Force failure count (used by tests / external anti-loop sensors).
   */
  recordFailure(sessionId) {
    let session = this._sessions.get(sessionId);
    if (!session) {
      session = { failures: 0, locked: false, lastMessage: null, cart: [] };
      this._sessions.set(sessionId, session);
    }
    session.failures += 1;
    if (session.failures >= this.antiLoopThreshold) {
      return this.handleAntiLoopTrigger(sessionId);
    }
    return { sessionId, locked: false, failures: session.failures };
  }

  /**
   * Anti-loop trigger: stop AI replies and notify Partner Dashboard.
   */
  handleAntiLoopTrigger(sessionId) {
    let session = this._sessions.get(sessionId);
    if (!session) {
      session = { failures: this.antiLoopThreshold, locked: false, cart: [] };
      this._sessions.set(sessionId, session);
    }
    session.locked = true;
    session.failures = Math.max(session.failures, this.antiLoopThreshold);

    const alert = {
      type: 'HITL_HANDOVER',
      sessionId,
      reason: 'isAntiLoopLocked',
      failures: session.failures,
      timestamp: Date.now(),
    };

    this.emit('anti_loop_trigger', alert);
    this.emit('partner_alert', alert);
    return { sessionId, handled: false, locked: true, alert };
  }

  /**
   * Outbound message (to WhatsApp provider).
   */
  sendMessage(sessionId, content) {
    const envelope = {
      id: crypto.randomUUID(),
      sessionId,
      content,
      sentAt: Date.now(),
    };
    this._outbound.push(envelope);
    this.emit('outbound', envelope);
    return envelope;
  }

  getSession(sessionId) {
    return this._sessions.get(sessionId) || null;
  }

  isLocked(sessionId) {
    const s = this._sessions.get(sessionId);
    return Boolean(s && s.locked);
  }

  unlock(sessionId) {
    const s = this._sessions.get(sessionId);
    if (s) {
      s.locked = false;
      s.failures = 0;
    }
  }
}

module.exports = { WhatsAppEngine };
