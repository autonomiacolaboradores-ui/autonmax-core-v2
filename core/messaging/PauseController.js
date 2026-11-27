'use strict';

const { ConversationRepository } = require('../storage/repositories/ConversationRepository');

const DEFAULT_MAX_PAUSED_CONTEXT = 40;

/**
 * Persisted Soft-Pause controller backed strictly by SQLite `conversations`
 * (`is_paused`, `human_requested`, `paused_context_json`).
 */
class PauseController {
  /**
   * @param {{
   *   dbManager?: import('../storage/DatabaseManager').DatabaseManager,
   *   conversationRepository?: ConversationRepository,
   *   maxPausedContext?: number
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.conversationRepository && !deps.dbManager) {
      throw new Error('PauseController requires conversationRepository or dbManager');
    }
    this.conversationRepository =
      deps.conversationRepository || new ConversationRepository(deps.dbManager);
    this.maxPausedContext = Number.isInteger(deps.maxPausedContext)
      ? deps.maxPausedContext
      : DEFAULT_MAX_PAUSED_CONTEXT;
  }

  /**
   * Resolves a conversation record either by `conversationId` or `(partnerId, channel, externalChatId)`.
   * @private
   */
  _resolveConversation({ partnerId, conversationId, channel = 'whatsapp', externalChatId }) {
    if (conversationId) {
      return this.conversationRepository.findById(conversationId, { partnerId });
    }
    if (partnerId && externalChatId) {
      return this.conversationRepository.findByExternalChat(
        partnerId,
        channel,
        externalChatId
      );
    }
    return null;
  }

  /**
   * Checks whether AI auto-reply is currently paused for the conversation.
   * @param {{ partnerId: string, conversationId?: string, channel?: string, externalChatId?: string }} target
   * @returns {boolean}
   */
  isPaused(target = {}) {
    const conv = this._resolveConversation(target);
    return Boolean(conv && Number(conv.is_paused) === 1);
  }

  /**
   * Activates Soft-Pause (human handoff) on the conversation in SQLite.
   * @param {{ partnerId: string, conversationId: string, humanRequested?: boolean }} params
   */
  pause({ partnerId, conversationId, humanRequested = true }) {
    return this.conversationRepository.setPaused(conversationId, true, {
      partnerId,
      humanRequested,
    });
  }

  /**
   * Resumes AI handling on the conversation. Optionally clears `paused_context_json`.
   * @param {{ partnerId: string, conversationId: string, clearContext?: boolean }} params
   */
  resume({ partnerId, conversationId, clearContext = false }) {
    if (clearContext) {
      return this.conversationRepository.clearPausedContext(conversationId, {
        partnerId,
      });
    }
    return this.conversationRepository.setPaused(conversationId, false, {
      partnerId,
      humanRequested: false,
    });
  }

  /**
   * Appends a message exchanged during Soft-Pause into `conversations.paused_context_json`
   * atomically inside `BEGIN IMMEDIATE` without clobbering `is_paused`.
   * @param {{ partnerId: string, conversationId: string, role?: 'customer' | 'operator', text: string, ts?: number }} params
   */
  recordPausedMessage({
    partnerId,
    conversationId,
    role = 'customer',
    text,
    ts = Date.now(),
  }) {
    const cleanText = String(text || '').trim().slice(0, 800);
    if (!cleanText) return null;

    return this.conversationRepository.appendPausedContext(
      conversationId,
      { ts, role, text: cleanText },
      { partnerId, maxEntries: this.maxPausedContext }
    );
  }

  /**
   * Formats stored pause-window messages as a continuity hint for resuming AI turns.
   * Atomically reads and optionally clears `paused_context_json` without clobbering `is_paused`.
   * @param {{ partnerId: string, conversationId: string, clear?: boolean, maxEntries?: number }} params
   * @returns {string | null}
   */
  consumePausedContextFact({
    partnerId,
    conversationId,
    clear = false,
    maxEntries = 12,
  }) {
    const entries = this.conversationRepository.consumePausedContext(conversationId, {
      partnerId,
      clear,
    });
    if (!Array.isArray(entries) || entries.length === 0) {
      return null;
    }

    const lines = entries.slice(-maxEntries).map((entry) => {
      const who = entry.role === 'operator' ? 'OPERADOR' : 'CLIENTE';
      return `${who}: ${entry.text}`;
    });

    return (
      'CONTEXTO ENQUANTO O ATENDIMENTO ESTAVA PAUSADO (humano no controle). Use para continuidade, sem repetir perguntas já respondidas:\n' +
      lines.join('\n')
    );
  }
}

module.exports = { PauseController, DEFAULT_MAX_PAUSED_CONTEXT };
