'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

const VALID_ORDER_STATUSES = new Set(['CONFIRMED', 'CANCELLED', 'DELIVERED']);

/**
 * Normalizes an order row with parsed items array.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydrateOrder(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    total_cents: Number(plain.total_cents),
    items: DatabaseManager.parseJson(plain.items_json, []),
  };
}

/**
 * Repository for product orders (`orders`) with immutable item/total snapshots.
 */
class OrderRepository {
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
   * Creates a product order atomically.
   * If `items` entries omit snapshot pricing (`priceCents` / `price_cents`),
   * resolves active PRODUCT records from `catalog_items` and computes `total_cents`.
   * @param {Record<string, unknown>} data
   */
  create(data) {
    const id = data.id || crypto.randomUUID();
    const partnerId = data.partnerId ?? data.partner_id;
    const customerId = data.customerId ?? data.customer_id ?? null;
    const clientName = String(data.clientName ?? data.client_name ?? '').trim();
    const customerPhone = data.customerPhone ?? data.customer_phone ?? null;
    const rawItems = data.items;
    const paymentMethod = data.paymentMethod ?? data.payment_method ?? null;
    const deliveryType = data.deliveryType ?? data.delivery_type ?? null;
    const address = data.address ?? null;
    const notes = data.notes ?? null;
    const status = String(data.status || 'CONFIRMED').toUpperCase();
    const idempotencyKey = data.idempotencyKey ?? data.idempotency_key ?? null;

    if (!partnerId || !clientName) {
      throw new Error('OrderRepository.create requires partnerId and clientName');
    }
    if (!VALID_ORDER_STATUSES.has(status)) {
      throw new Error(`Invalid order status: ${status}`);
    }
    if (!Array.isArray(rawItems) && typeof data.items_json !== 'string') {
      throw new Error('OrderRepository.create requires an items array or items_json');
    }

    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      let resolvedItems;
      let totalCents = data.totalCents ?? data.total_cents;

      if (Array.isArray(rawItems)) {
        let computedTotal = 0;
        resolvedItems = rawItems.map((entry) => {
          const qty = Number(entry.qty ?? entry.quantity ?? 1);
          if (!Number.isInteger(qty) || qty <= 0) {
            throw new Error(`Order item qty must be a positive integer, got: ${qty}`);
          }

          const unitPrice = entry.priceCents ?? entry.price_cents;
          const itemName = entry.name ?? entry.itemName ?? entry.item_name;
          const catalogItemId =
            entry.catalogItemId ?? entry.catalog_item_id ?? entry.itemId ?? entry.item_id;

          if (unitPrice !== undefined && itemName !== undefined) {
            const cents = Number(unitPrice);
            if (!Number.isInteger(cents) || cents < 0) {
              throw new Error(`Invalid item price_cents: ${cents}`);
            }
            computedTotal += cents * qty;
            return {
              catalog_item_id: catalogItemId || null,
              name: String(itemName),
              price_cents: cents,
              qty,
              subtotal_cents: cents * qty,
            };
          }

          if (!catalogItemId) {
            throw new Error(
              'Order item without snapshot price/name must specify catalogItemId/itemId'
            );
          }

          const catalogItem = DatabaseManager.toPlain(
            db
              .prepare('SELECT * FROM catalog_items WHERE id = ? AND partner_id = ?')
              .get(catalogItemId, partnerId)
          );
          if (!catalogItem) {
            throw new Error(`Catalog item not found: ${catalogItemId}`);
          }
          if (Number(catalogItem.active) !== 1) {
            throw new Error(`Catalog item is inactive: ${catalogItemId}`);
          }
          if (catalogItem.item_type !== 'PRODUCT') {
            throw new Error(
              `Cannot order non-PRODUCT catalog item: ${catalogItemId} (${catalogItem.item_type})`
            );
          }

          const cents = Number(catalogItem.price_cents);
          computedTotal += cents * qty;
          return {
            catalog_item_id: catalogItem.id,
            name: catalogItem.name,
            price_cents: cents,
            qty,
            subtotal_cents: cents * qty,
            version_hash: catalogItem.version_hash,
          };
        });

        if (totalCents === undefined) {
          totalCents = computedTotal;
        }
      } else {
        resolvedItems = DatabaseManager.parseJson(data.items_json, []);
      }

      const finalTotal = Number(totalCents);
      if (!Number.isInteger(finalTotal) || finalTotal < 0) {
        throw new Error(`total_cents must be a non-negative integer, got: ${finalTotal}`);
      }

      const itemsJson =
        typeof data.items_json === 'string' && !Array.isArray(rawItems)
          ? data.items_json
          : JSON.stringify(resolvedItems);

      db.prepare(
        `INSERT INTO orders (
          id, partner_id, customer_id, client_name, customer_phone,
          items_json, total_cents, payment_method, delivery_type,
          address, notes, status, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        partnerId,
        customerId,
        clientName,
        customerPhone,
        itemsJson,
        finalTotal,
        paymentMethod,
        deliveryType,
        address,
        notes,
        status,
        idempotencyKey
      );

      return hydrateOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
    });
  }

  /**
   * Finds an order by primary key, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  findById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare('SELECT * FROM orders WHERE id = ? AND partner_id = ?')
          .get(id, partnerId)
      : this._db().prepare('SELECT * FROM orders WHERE id = ?').get(id);
    return hydrateOrder(row);
  }

  /**
   * Finds an order by idempotency key, optionally scoped by `partnerId`.
   * @param {string} idempotencyKey
   * @param {string | { partnerId?: string }} [options]
   */
  findByIdempotencyKey(idempotencyKey, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare('SELECT * FROM orders WHERE idempotency_key = ? AND partner_id = ?')
          .get(idempotencyKey, partnerId)
      : this._db()
          .prepare('SELECT * FROM orders WHERE idempotency_key = ?')
          .get(idempotencyKey);
    return hydrateOrder(row);
  }

  /**
   * Lists orders for a partner.
   * @param {string} partnerId
   * @param {{ status?: string, limit?: number, offset?: number }} [options]
   */
  listByPartner(partnerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const offset = Number.isInteger(options.offset) ? options.offset : 0;

    if (options.status) {
      return this._db()
        .prepare(
          `SELECT * FROM orders
           WHERE partner_id = ? AND status = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ? OFFSET ?`
        )
        .all(partnerId, String(options.status).toUpperCase(), limit, offset)
        .map(hydrateOrder);
    }

    return this._db()
      .prepare(
        `SELECT * FROM orders
         WHERE partner_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ? OFFSET ?`
      )
      .all(partnerId, limit, offset)
      .map(hydrateOrder);
  }

  /**
   * Lists orders for a customer, optionally scoped by `partnerId`.
   * @param {string} customerId
   * @param {{ limit?: number, partnerId?: string }} [options]
   */
  listByCustomer(customerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const partnerId = DatabaseManager.extractPartnerId(options);
    const sql = partnerId
      ? `SELECT * FROM orders
         WHERE customer_id = ? AND partner_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`
      : `SELECT * FROM orders
         WHERE customer_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`;
    const params = partnerId ? [customerId, partnerId, limit] : [customerId, limit];
    return this._db()
      .prepare(sql)
      .all(...params)
      .map(hydrateOrder);
  }

  /**
   * Updates order status, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {'CONFIRMED' | 'CANCELLED' | 'DELIVERED'} status
   * @param {string | { partnerId?: string }} [options]
   */
  updateStatus(id, status, options = {}) {
    const normalized = String(status).toUpperCase();
    if (!VALID_ORDER_STATUSES.has(normalized)) {
      throw new Error(`Invalid order status: ${status}`);
    }
    const partnerId = DatabaseManager.extractPartnerId(options);
    if (partnerId) {
      this._db()
        .prepare(
          'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND partner_id = ?'
        )
        .run(normalized, id, partnerId);
    } else {
      this._db()
        .prepare(
          'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .run(normalized, id);
    }
    return this.findById(id, { partnerId });
  }

  /**
   * Cancels an order.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  cancel(id, options = {}) {
    return this.updateStatus(id, 'CANCELLED', options);
  }

  /**
   * Marks an order as delivered.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  markDelivered(id, options = {}) {
    return this.updateStatus(id, 'DELIVERED', options);
  }
}

module.exports = { OrderRepository };
