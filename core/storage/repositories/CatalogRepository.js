'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

const VALID_ITEM_TYPES = new Set(['SERVICE', 'PRODUCT']);

/**
 * Computes canonical SHA-256 hash for a catalog item:
 * SHA256(id|item_type|name|description|price_cents|duration_minutes)
 * @param {{ id: string, itemType: string, name: string, description: string, priceCents: number, durationMinutes: number }} fields
 * @returns {string}
 */
function computeVersionHash({
  id,
  itemType,
  name,
  description,
  priceCents,
  durationMinutes,
}) {
  const canonical = `${id}|${itemType}|${name}|${description}|${priceCents}|${durationMinutes}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Repository for catalog products and services (`catalog_items`) with canonical
 * SHA-256 version hashing and soft-delete preservation.
 */
class CatalogRepository {
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
   * Exposes canonical version hash computation.
   */
  static computeVersionHash(fields) {
    return computeVersionHash({
      id: fields.id,
      itemType: fields.itemType ?? fields.item_type,
      name: fields.name,
      description: fields.description ?? '',
      priceCents: fields.priceCents ?? fields.price_cents,
      durationMinutes: fields.durationMinutes ?? fields.duration_minutes ?? 30,
    });
  }

  /**
   * Creates a new catalog item and computes its canonical version_hash.
   * @param {Record<string, unknown>} data
   */
  create(data) {
    const id = data.id || crypto.randomUUID();
    const partnerId = data.partnerId ?? data.partner_id;
    const itemType = String((data.itemType ?? data.item_type) || '').toUpperCase();
    const name = String(data.name || '').trim();
    const description = String(data.description ?? '');
    const priceCents = Number(data.priceCents ?? data.price_cents);
    const durationMinutes =
      data.durationMinutes !== undefined
        ? Number(data.durationMinutes)
        : data.duration_minutes !== undefined
          ? Number(data.duration_minutes)
          : 30;
    const category = String(data.category ?? 'geral');
    const active =
      data.active !== undefined ? Number(Boolean(data.active)) : 1;

    if (!partnerId || !name) {
      throw new Error('CatalogRepository.create requires partnerId and name');
    }
    if (!VALID_ITEM_TYPES.has(itemType)) {
      throw new Error(`Invalid item_type: ${itemType}. Expected SERVICE or PRODUCT`);
    }
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      throw new Error(`price_cents must be a non-negative integer, got: ${priceCents}`);
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new Error(`duration_minutes must be a positive integer, got: ${durationMinutes}`);
    }

    const versionHash = computeVersionHash({
      id,
      itemType,
      name,
      description,
      priceCents,
      durationMinutes,
    });

    this._db()
      .prepare(
        `INSERT INTO catalog_items (
          id, partner_id, item_type, name, description,
          price_cents, duration_minutes, category, active, version_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        partnerId,
        itemType,
        name,
        description,
        priceCents,
        durationMinutes,
        category,
        active,
        versionHash
      );

    return this.findById(id);
  }

  /**
   * Finds a catalog item by id (includes inactive items by default).
   * Optionally scopes lookup by `partnerId`.
   * @param {string} id
   * @param {string | { includeInactive?: boolean, partnerId?: string }} [options]
   */
  findById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const includeInactive =
      typeof options === 'object' && options !== null
        ? options.includeInactive !== false
        : true;
    const clauses = ['id = ?'];
    const params = [id];
    if (!includeInactive) {
      clauses.push('active = 1');
    }
    if (partnerId) {
      clauses.push('partner_id = ?');
      params.push(partnerId);
    }
    const row = this._db()
      .prepare(`SELECT * FROM catalog_items WHERE ${clauses.join(' AND ')}`)
      .get(...params);
    return DatabaseManager.toPlain(row);
  }

  /**
   * Finds an active catalog item by id.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  findActiveById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    return this.findById(id, { includeInactive: false, partnerId });
  }

  /**
   * Lists catalog items for a partner. Defaults to active items only.
   * @param {string} partnerId
   * @param {{ includeInactive?: boolean, itemType?: string, category?: string }} [options]
   */
  listByPartner(partnerId, options = {}) {
    const clauses = ['partner_id = ?'];
    const params = [partnerId];

    if (!options.includeInactive) {
      clauses.push('active = 1');
    }
    if (options.itemType) {
      clauses.push('item_type = ?');
      params.push(String(options.itemType).toUpperCase());
    }
    if (options.category) {
      clauses.push('category = ?');
      params.push(String(options.category));
    }

    const sql = `SELECT * FROM catalog_items WHERE ${clauses.join(' AND ')} ORDER BY name ASC, id ASC`;
    return this._db()
      .prepare(sql)
      .all(...params)
      .map(DatabaseManager.toPlain);
  }

  /**
   * Updates a catalog item and recomputes its canonical version_hash.
   * Does not alter historical appointment/order snapshots.
   * @param {string} id
   * @param {Record<string, unknown>} patch
   * @param {string | { partnerId?: string }} [options]
   */
  update(id, patch = {}, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      const existing = DatabaseManager.toPlain(
        partnerId
          ? db
              .prepare('SELECT * FROM catalog_items WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id)
      );
      if (!existing) {
        return null;
      }

      const itemType = String(
        patch.itemType ?? patch.item_type ?? existing.item_type
      ).toUpperCase();
      const name = String(patch.name ?? existing.name).trim();
      const description = String(patch.description ?? existing.description ?? '');
      const priceCents = Number(
        patch.priceCents ?? patch.price_cents ?? existing.price_cents
      );
      const durationMinutes = Number(
        patch.durationMinutes ?? patch.duration_minutes ?? existing.duration_minutes
      );
      const category = String(patch.category ?? existing.category);
      const active =
        patch.active !== undefined ? Number(Boolean(patch.active)) : existing.active;

      if (!VALID_ITEM_TYPES.has(itemType)) {
        throw new Error(`Invalid item_type: ${itemType}`);
      }
      if (!name) {
        throw new Error('Catalog item name cannot be empty');
      }
      if (!Number.isInteger(priceCents) || priceCents < 0) {
        throw new Error(`price_cents must be a non-negative integer, got: ${priceCents}`);
      }
      if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
        throw new Error(
          `duration_minutes must be a positive integer, got: ${durationMinutes}`
        );
      }

      const versionHash = computeVersionHash({
        id,
        itemType,
        name,
        description,
        priceCents,
        durationMinutes,
      });

      const updateSql = partnerId
        ? `UPDATE catalog_items
           SET item_type = ?, name = ?, description = ?, price_cents = ?,
               duration_minutes = ?, category = ?, active = ?, version_hash = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND partner_id = ?`
        : `UPDATE catalog_items
           SET item_type = ?, name = ?, description = ?, price_cents = ?,
               duration_minutes = ?, category = ?, active = ?, version_hash = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`;
      const updateParams = [
        itemType,
        name,
        description,
        priceCents,
        durationMinutes,
        category,
        active,
        versionHash,
        id,
      ];
      if (partnerId) updateParams.push(partnerId);

      db.prepare(updateSql).run(...updateParams);

      return DatabaseManager.toPlain(
        partnerId
          ? db
              .prepare('SELECT * FROM catalog_items WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id)
      );
    });
  }

  /**
   * Soft-deletes (deactivates) a catalog item without breaking FK references
   * or historical appointment/order snapshots.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  softDelete(id, options = {}) {
    return this.update(id, { active: false }, options);
  }

  /**
   * Alias for softDelete.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  deactivate(id, options = {}) {
    return this.softDelete(id, options);
  }

  /**
   * Re-activates a soft-deleted catalog item.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  activate(id, options = {}) {
    return this.update(id, { active: true }, options);
  }
}

module.exports = { CatalogRepository, computeVersionHash };
