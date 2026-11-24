'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

/**
 * Normalizes a conversation row with parsed paused_context array.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydrateConversation(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    is_paused: Number(plain.is_paused || 0),
    human_requested: Number(plain.human_requested || 0),
    paused_context: DatabaseManager.parseJson(plain.paused_context_json, []),
  };
}

/**
 * Normalizes a message row with parsed metadata object.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydrateMessage(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    metadata: DatabaseManager.parseJson(plain.metadata_json, {}),
  };
}

/**
 * Repository for conversations (`conversations`), soft-pause state,
 * and detailed message history (`messages`).
 */
class ConversationRepository {
  /**
   * @param {DatabaseManager | import('node:sqlite').DatabaseSync} dbOrManager
   */
  constructor(dbOrManager) {
    this.dbOrManager = dbOrManager;
  }

  /**
   * @private
   */
  _db() {
    return DatabaseManager.resolveDb(this.dbOrManager);
  }

  /**
   * Creates or returns an existing conversation for (partner_id, channel, external_chat_id).
   * @param {Record<string, unknown>} data
   */
  upsertConversation(data) {
    const partnerId = data.partnerId ?? data.partner_id;
    const customerId = data.customerId ?? data.customer_id;
    const channel = String(data.channel || '').trim();
    const externalChatId = String(
      data.externalChatId ?? data.external_chat_id ?? ''
    ).trim();

    if (!partnerId || !customerId || !channel || !externalChatId) {
      throw new Error(
        'ConversationRepository.upsertConversation requires partnerId, customerId, channel, and externalChatId'
      );
    }

    const id = data.id || crypto.randomUUID();
    const isPaused =
      data.isPaused !== undefined
        ? Number(Boolean(data.isPaused))
        : Number(Boolean(data.is_paused || 0));
    const humanRequested =
      data.humanRequested !== undefined
        ? Number(Boolean(data.humanRequested))
        : Number(Boolean(data.human_requested || 0));
    const pausedContextJson = DatabaseManager.stringifyJson(
      data.pausedContext ?? data.paused_context ?? data.paused_context_json ?? [],
      '[]'
    );
    const lastMessageAt =
      data.lastMessageAt ?? data.last_message_at ?? new Date().toISOString();

    this._db()
      .prepare(
        `INSERT INTO conversations (
          id, partner_id, customer_id, channel, external_chat_id,
          is_paused, human_requested, paused_context_json, last_message_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(partner_id, channel, external_chat_id) DO UPDATE SET
          customer_id = excluded.customer_id,
          last_message_at = COALESCE(excluded.last_message_at, conversations.last_message_at)`
      )
      .run(
        id,
        partnerId,
        customerId,
        channel,
        externalChatId,
        isPaused,
        humanRequested,
        pausedContextJson,
        lastMessageAt
      );

    return this.findByExternalChat(partnerId, channel, externalChatId);
  }

  /**
   * Finds a conversation by primary key, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  findById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare('SELECT * FROM conversations WHERE id = ? AND partner_id = ?')
          .get(id, partnerId)
      : this._db().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    return hydrateConversation(row);
  }

  /**
   * Finds a conversation by (partner_id, channel, external_chat_id).
   * @param {string} partnerId
   * @param {string} channel
   * @param {string} externalChatId
   */
  findByExternalChat(partnerId, channel, externalChatId) {
    const row = this._db()
      .prepare(
        `SELECT * FROM conversations
         WHERE partner_id = ? AND channel = ? AND external_chat_id = ?`
      )
      .get(partnerId, String(channel), String(externalChatId));
    return hydrateConversation(row);
  }

  /**
   * Toggles persisted soft-pause and human handoff state.
   * @param {string} id
   * @param {boolean} isPaused
   * @param {{ partnerId?: string, humanRequested?: boolean, pausedContext?: unknown[] }} [options]
   */
  setPaused(id, isPaused, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const assignments = ['is_paused = ?'];
    const params = [Number(Boolean(isPaused))];

    if (options.humanRequested !== undefined) {
      assignments.push('human_requested = ?');
      params.push(Number(Boolean(options.humanRequested)));
    }
    if (options.pausedContext !== undefined) {
      assignments.push('paused_context_json = ?');
      params.push(DatabaseManager.stringifyJson(options.pausedContext, '[]'));
    }

    params.push(id);
    if (partnerId) params.push(partnerId);

    const whereClause = partnerId ? 'id = ? AND partner_id = ?' : 'id = ?';
    this._db()
      .prepare(`UPDATE conversations SET ${assignments.join(', ')} WHERE ${whereClause}`)
      .run(...params);

    return this.findById(id, { partnerId });
  }

  /**
   * Appends a human/customer interaction snippet into `paused_context_json`.
   * @param {string} id
   * @param {unknown} entry
   * @param {string | { partnerId?: string }} [options]
   */
  appendPausedContext(id, entry, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      const conv = hydrateConversation(
        partnerId
          ? db
              .prepare('SELECT * FROM conversations WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
      );
      if (!conv) return null;

      const updated = [...conv.paused_context, entry];
      if (partnerId) {
        db.prepare(
          'UPDATE conversations SET paused_context_json = ? WHERE id = ? AND partner_id = ?'
        ).run(JSON.stringify(updated), id, partnerId);
      } else {
        db.prepare('UPDATE conversations SET paused_context_json = ? WHERE id = ?').run(
          JSON.stringify(updated),
          id
        );
      }
      return hydrateConversation(
        partnerId
          ? db
              .prepare('SELECT * FROM conversations WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
      );
    });
  }

  /**
   * Clears `paused_context_json` and resets `human_requested`.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  clearPausedContext(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    return this.setPaused(id, false, {
      partnerId,
      humanRequested: false,
      pausedContext: [],
    });
  }

  /**
   * Lists all conversations for a partner ordered by most recent message.
   * @param {string} partnerId
   * @param {{ limit?: number, offset?: number }} [options]
   */
  listByPartner(partnerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 100;
    const offset = Number.isInteger(options.offset) ? options.offset : 0;
    return this._db()
      .prepare(
        `SELECT * FROM conversations
         WHERE partner_id = ?
         ORDER BY COALESCE(last_message_at, '') DESC, rowid DESC
         LIMIT ? OFFSET ?`
      )
      .all(partnerId, limit, offset)
      .map(hydrateConversation);
  }

  /**
   * Lists currently paused conversations for a partner.
   * @param {string} partnerId
   */
  listPausedByPartner(partnerId) {
    return this._db()
      .prepare(
        'SELECT * FROM conversations WHERE partner_id = ? AND is_paused = 1 ORDER BY last_message_at DESC'
      )
      .all(partnerId)
      .map(hydrateConversation);
  }

  /**
   * Appends a message to `messages` and updates `conversations.last_message_at` atomically.
   * @param {Record<string, unknown>} data
   */
  addMessage(data) {
    const id = data.id || crypto.randomUUID();
    const conversationId = data.conversationId ?? data.conversation_id;
    const partnerId = data.partnerId ?? data.partner_id;
    const direction = String(data.direction || '').toUpperCase();
    const role = String(data.role || '').toLowerCase();
    const contentType = String(data.contentType ?? data.content_type ?? 'text');
    const content = String(data.content ?? '');
    const metadataJson = DatabaseManager.stringifyJson(
      data.metadata ?? data.metadata_json ?? {},
      '{}'
    );

    if (!conversationId || !partnerId || !direction || !role) {
      throw new Error(
        'ConversationRepository.addMessage requires conversationId, partnerId, direction, and role'
      );
    }

    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      db.prepare(
        `INSERT INTO messages (
          id, conversation_id, partner_id, direction, role, content_type, content, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        conversationId,
        partnerId,
        direction,
        role,
        contentType,
        content,
        metadataJson
      );

      db.prepare(
        'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(conversationId);

      return hydrateMessage(
        db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
      );
    });
  }

  /**
   * Lists messages in a conversation, optionally scoped by `partnerId`.
   * @param {string} conversationId
   * @param {{ limit?: number, offset?: number, order?: 'ASC' | 'DESC', partnerId?: string }} [options]
   */
  listMessages(conversationId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const offset = Number.isInteger(options.offset) ? options.offset : 0;
    const order = String(options.order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const partnerId = DatabaseManager.extractPartnerId(options);

    const sql = partnerId
      ? `SELECT * FROM messages
         WHERE conversation_id = ? AND partner_id = ?
         ORDER BY created_at ${order}, rowid ${order}
         LIMIT ? OFFSET ?`
      : `SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ${order}, rowid ${order}
         LIMIT ? OFFSET ?`;
    const params = partnerId
      ? [conversationId, partnerId, limit, offset]
      : [conversationId, limit, offset];

    return this._db()
      .prepare(sql)
      .all(...params)
      .map(hydrateMessage);
  }

  /**
   * Returns the latest `limit` messages in chronological (oldest -> newest) order.
   * Optionally scoped by `partnerId`.
   * @param {string} conversationId
   * @param {number | { limit?: number, partnerId?: string }} [limitOrOptions=20]
   * @param {{ partnerId?: string }} [maybeOptions]
   */
  getRecentMessages(conversationId, limitOrOptions = 20, maybeOptions = {}) {
    const limit =
      typeof limitOrOptions === 'number'
        ? limitOrOptions
        : Number.isInteger(limitOrOptions?.limit)
          ? limitOrOptions.limit
          : 20;
    const partnerId =
      typeof limitOrOptions === 'object' && limitOrOptions !== null
        ? DatabaseManager.extractPartnerId(limitOrOptions)
        : DatabaseManager.extractPartnerId(maybeOptions);

    const sql = partnerId
      ? `SELECT m.* FROM messages m
         JOIN (
           SELECT id, created_at, rowid AS _seq
           FROM messages
           WHERE conversation_id = ? AND partner_id = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?
         ) recent ON m.id = recent.id
         ORDER BY recent.created_at ASC, recent._seq ASC`
      : `SELECT m.* FROM messages m
         JOIN (
           SELECT id, created_at, rowid AS _seq
           FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?
         ) recent ON m.id = recent.id
         ORDER BY recent.created_at ASC, recent._seq ASC`;
    const params = partnerId ? [conversationId, partnerId, limit] : [conversationId, limit];

    const rows = this._db().prepare(sql).all(...params);
    return rows.map(hydrateMessage);
  }
}

module.exports = { ConversationRepository };
