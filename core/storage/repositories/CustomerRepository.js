'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

/**
 * Normalizes a customer row with parsed JSON facts.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydrateCustomer(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    visits_count: Number(plain.visits_count || 0),
    facts: DatabaseManager.parseJson(plain.facts_json, {}),
  };
}

/**
 * Repository for end-customers CRM records (`customers`).
 */
class CustomerRepository {
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
   * Inserts or updates a customer identified by (partner_id, channel, external_id).
   * @param {Record<string, unknown>} data
   */
  upsert(data) {
    const partnerId = data.partnerId ?? data.partner_id;
    const channel = String(data.channel || '').trim();
    const externalId = String(data.externalId ?? data.external_id ?? '').trim();

    if (!partnerId || !channel || !externalId) {
      throw new Error(
        'CustomerRepository.upsert requires partnerId, channel, and externalId'
      );
    }

    const id = data.id || crypto.randomUUID();
    const name = data.name ?? null;
    const phone = data.phone ?? null;
    const factsJson = DatabaseManager.stringifyJson(
      data.facts ?? data.facts_json ?? {},
      '{}'
    );
    const visitsCount = Number.isInteger(data.visitsCount ?? data.visits_count)
      ? Number(data.visitsCount ?? data.visits_count)
      : 0;
    const lastSeenAt =
      data.lastSeenAt ?? data.last_seen_at ?? new Date().toISOString();

    this._db()
      .prepare(
        `INSERT INTO customers (
          id, partner_id, channel, external_id, name, phone, facts_json, visits_count, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(partner_id, channel, external_id) DO UPDATE SET
          name = COALESCE(excluded.name, customers.name),
          phone = COALESCE(excluded.phone, customers.phone),
          facts_json = CASE
            WHEN excluded.facts_json IS NOT NULL AND excluded.facts_json != '{}' THEN excluded.facts_json
            ELSE customers.facts_json
          END,
          last_seen_at = COALESCE(excluded.last_seen_at, customers.last_seen_at)`
      )
      .run(
        id,
        partnerId,
        channel,
        externalId,
        name,
        phone,
        factsJson,
        visitsCount,
        lastSeenAt
      );

    return this.findByExternal(partnerId, channel, externalId);
  }

  /**
   * Finds a customer by primary key, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  findById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare('SELECT * FROM customers WHERE id = ? AND partner_id = ?')
          .get(id, partnerId)
      : this._db().prepare('SELECT * FROM customers WHERE id = ?').get(id);
    return hydrateCustomer(row);
  }

  /**
   * Finds a customer by partner, channel, and external identifier.
   * @param {string} partnerId
   * @param {string} channel
   * @param {string} externalId
   */
  findByExternal(partnerId, channel, externalId) {
    const row = this._db()
      .prepare(
        'SELECT * FROM customers WHERE partner_id = ? AND channel = ? AND external_id = ?'
      )
      .get(partnerId, String(channel), String(externalId));
    return hydrateCustomer(row);
  }

  /**
   * Lists customers belonging to a partner.
   * @param {string} partnerId
   * @param {{ limit?: number, offset?: number }} [options]
   */
  listByPartner(partnerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 100;
    const offset = Number.isInteger(options.offset) ? options.offset : 0;
    return this._db()
      .prepare(
        `SELECT * FROM customers
         WHERE partner_id = ?
         ORDER BY COALESCE(last_seen_at, '') DESC, id ASC
         LIMIT ? OFFSET ?`
      )
      .all(partnerId, limit, offset)
      .map(hydrateCustomer);
  }

  /**
   * Atomically merges facts into `customers.facts_json`.
   * Optionally scoped by `partnerId`.
   * @param {string} id
   * @param {Record<string, unknown>} factsPatch
   * @param {string | { partnerId?: string }} [options]
   */
  updateFacts(id, factsPatch = {}, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      const existing = hydrateCustomer(
        partnerId
          ? db
              .prepare('SELECT * FROM customers WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
      );
      if (!existing) return null;

      const merged = { ...existing.facts, ...factsPatch };
      if (partnerId) {
        db.prepare(
          'UPDATE customers SET facts_json = ? WHERE id = ? AND partner_id = ?'
        ).run(JSON.stringify(merged), id, partnerId);
      } else {
        db.prepare('UPDATE customers SET facts_json = ? WHERE id = ?').run(
          JSON.stringify(merged),
          id
        );
      }
      return hydrateCustomer(
        partnerId
          ? db
              .prepare('SELECT * FROM customers WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
      );
    });
  }

  /**
   * Increments `visits_count` and updates `last_seen_at`.
   * Optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string} [seenAt]
   * @param {string | { partnerId?: string }} [options]
   */
  incrementVisits(id, seenAt = new Date().toISOString(), options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    if (partnerId) {
      this._db()
        .prepare(
          `UPDATE customers
           SET visits_count = COALESCE(visits_count, 0) + 1,
               last_seen_at = ?
           WHERE id = ? AND partner_id = ?`
        )
        .run(seenAt, id, partnerId);
    } else {
      this._db()
        .prepare(
          `UPDATE customers
           SET visits_count = COALESCE(visits_count, 0) + 1,
               last_seen_at = ?
           WHERE id = ?`
        )
        .run(seenAt, id);
    }
    return this.findById(id, { partnerId });
  }
}

module.exports = { CustomerRepository };
