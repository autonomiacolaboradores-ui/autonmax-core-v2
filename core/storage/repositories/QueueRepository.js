'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

/**
 * Normalizes an outbox queue row with parsed payload object.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydrateOutbox(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    attempts: Number(plain.attempts || 0),
    next_attempt_at: Number(plain.next_attempt_at),
    payload: DatabaseManager.parseJson(plain.payload_json, {}),
  };
}

/**
 * Repository for inbound event idempotency (`processed_events`)
 * and durable anti-ban outbound delivery queue (`outbox_queue`).
 */
class QueueRepository {
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
   * Checks whether an inbound event key was already processed.
   * @param {string} eventKey
   * @returns {boolean}
   */
  isEventProcessed(eventKey) {
    const row = this._db()
      .prepare('SELECT 1 AS found FROM processed_events WHERE event_key = ?')
      .get(String(eventKey));
    return Boolean(row);
  }

  /**
   * Records an event key idempotently. Returns true if newly inserted.
   * @param {string} eventKey
   * @param {string} sessionKey
   * @returns {boolean}
   */
  markEventProcessed(eventKey, sessionKey) {
    const info = this._db()
      .prepare(
        `INSERT OR IGNORE INTO processed_events (event_key, session_key)
         VALUES (?, ?)`
      )
      .run(String(eventKey), String(sessionKey));
    return info.changes > 0;
  }

  /**
   * Enqueues an outbound payload in `outbox_queue`.
   * @param {Record<string, unknown>} data
   */
  enqueueOutbox(data) {
    const id = data.id || crypto.randomUUID();
    const sessionKey = String(data.sessionKey ?? data.session_key ?? '');
    const channel = String(data.channel || '');
    const recipientId = String(data.recipientId ?? data.recipient_id ?? '');
    const payloadJson = DatabaseManager.stringifyJson(
      data.payload ?? data.payload_json ?? {},
      '{}'
    );
    const status = String(data.status || 'PENDING').toUpperCase();
    const attempts = Number.isInteger(data.attempts) ? data.attempts : 0;
    const nextAttemptAt = Math.trunc(
      Number(data.nextAttemptAt ?? data.next_attempt_at ?? Date.now())
    );

    if (!sessionKey || !channel || !recipientId) {
      throw new Error(
        'QueueRepository.enqueueOutbox requires sessionKey, channel, and recipientId'
      );
    }

    this._db()
      .prepare(
        `INSERT INTO outbox_queue (
          id, session_key, channel, recipient_id, payload_json, status, attempts, next_attempt_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        sessionKey,
        channel,
        recipientId,
        payloadJson,
        status,
        attempts,
        nextAttemptAt
      );

    return this.findOutboxById(id);
  }

  /**
   * Atomically marks an inbound event as processed and enqueues the outbound reply
   * in the same SQLite transaction.
   * @param {{ eventKey: string, sessionKey: string, outboxId?: string, channel: string, recipientId: string, payload: unknown, nextAttemptAt?: number }} data
   */
  enqueueWithIdempotency(data) {
    const eventKey = String(data.eventKey ?? data.event_key);
    const sessionKey = String(data.sessionKey ?? data.session_key);
    const outboxId = data.outboxId ?? data.id ?? crypto.randomUUID();
    const channel = String(data.channel);
    const recipientId = String(data.recipientId ?? data.recipient_id);
    const payloadJson = DatabaseManager.stringifyJson(
      data.payload ?? data.payload_json ?? {},
      '{}'
    );
    const nextAttemptAt = Math.trunc(
      Number(data.nextAttemptAt ?? data.next_attempt_at ?? Date.now())
    );

    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      const insertEvent = db
        .prepare(
          'INSERT OR IGNORE INTO processed_events (event_key, session_key) VALUES (?, ?)'
        )
        .run(eventKey, sessionKey);

      if (insertEvent.changes === 0) {
        return { duplicate: true, enqueued: false, outbox: null };
      }

      db.prepare(
        `INSERT INTO outbox_queue (
          id, session_key, channel, recipient_id, payload_json, status, attempts, next_attempt_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?)`
      ).run(outboxId, sessionKey, channel, recipientId, payloadJson, nextAttemptAt);

      const outbox = hydrateOutbox(
        db.prepare('SELECT * FROM outbox_queue WHERE id = ?').get(outboxId)
      );
      return { duplicate: false, enqueued: true, outbox };
    });
  }

  /**
   * Finds an outbox item by primary key.
   * @param {string} id
   */
  findOutboxById(id) {
    return hydrateOutbox(
      this._db().prepare('SELECT * FROM outbox_queue WHERE id = ?').get(id)
    );
  }

  /**
   * Fetches due PENDING items from the outbox queue.
   * @param {{ nowMs?: number, limit?: number, sessionKey?: string }} [options]
   */
  fetchDueOutbox(options = {}) {
    const nowMs = Math.trunc(Number(options.nowMs ?? Date.now()));
    const limit = Number.isInteger(options.limit) ? options.limit : 20;

    if (options.sessionKey) {
      return this._db()
        .prepare(
          `SELECT * FROM outbox_queue
           WHERE status = 'PENDING' AND next_attempt_at <= ? AND session_key = ?
           ORDER BY next_attempt_at ASC, created_at ASC, rowid ASC
           LIMIT ?`
        )
        .all(nowMs, String(options.sessionKey), limit)
        .map(hydrateOutbox);
    }

    return this._db()
      .prepare(
        `SELECT * FROM outbox_queue
         WHERE status = 'PENDING' AND next_attempt_at <= ?
         ORDER BY next_attempt_at ASC, created_at ASC, rowid ASC
         LIMIT ?`
      )
      .all(nowMs, limit)
      .map(hydrateOutbox);
  }

  /**
   * Counts pending items in `outbox_queue`.
   * @returns {number}
   */
  countPendingOutbox() {
    const row = this._db()
      .prepare("SELECT COUNT(*) AS cnt FROM outbox_queue WHERE status = 'PENDING'")
      .get();
    return Number(row?.cnt || 0);
  }

  /**
   * Marks an outbox entry as SENT.
   * @param {string} id
   */
  markOutboxSent(id) {
    this._db()
      .prepare("UPDATE outbox_queue SET status = 'SENT' WHERE id = ?")
      .run(id);
    return this.findOutboxById(id);
  }

  /**
   * Increments retry attempts and schedules next attempt timestamp.
   * @param {string} id
   * @param {{ nextAttemptAt: number }} options
   */
  markOutboxRetry(id, options) {
    const nextAttemptAt = Math.trunc(Number(options.nextAttemptAt));
    this._db()
      .prepare(
        `UPDATE outbox_queue
         SET attempts = COALESCE(attempts, 0) + 1,
             next_attempt_at = ?
         WHERE id = ?`
      )
      .run(nextAttemptAt, id);
    return this.findOutboxById(id);
  }

  /**
   * Marks an outbox entry as permanently FAILED.
   * @param {string} id
   */
  markOutboxFailed(id) {
    this._db()
      .prepare(
        "UPDATE outbox_queue SET status = 'FAILED', attempts = COALESCE(attempts, 0) + 1 WHERE id = ?"
      )
      .run(id);
    return this.findOutboxById(id);
  }
}

module.exports = { QueueRepository };
