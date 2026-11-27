'use strict';

const { DatabaseManager } = require('../storage/DatabaseManager');
const { OrderRepository } = require('../storage/repositories/OrderRepository');
const { CatalogRepository } = require('../storage/repositories/CatalogRepository');
const { DomainError, formatPriceCents } = require('./RegionalNormalizer');

/**
 * Transactional product-order domain engine implementing Elo 2:
 * - Requires `confirmed === true`
 * - Validates every item belongs to `partnerId`, is active, and has `item_type === 'PRODUCT'`
 * - Ignores any external pricing/totals and calculates `total_cents` strictly from SQLite
 * - Supports `idempotencyKey` and atomic cancellation
 */
class OrderService {
  /**
   * @param {{
   *   dbManager: DatabaseManager,
   *   orderRepository?: OrderRepository,
   *   catalogRepository?: CatalogRepository
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.dbManager) {
      throw new Error('OrderService requires dbManager');
    }
    this.dbManager = deps.dbManager;
    this.orderRepository = deps.orderRepository || new OrderRepository(deps.dbManager);
    this.catalogRepository =
      deps.catalogRepository || new CatalogRepository(deps.dbManager);
  }

  /**
   * Creates a confirmed product order inside a BEGIN IMMEDIATE transaction.
   * Any external price fields (`price`, `priceCents`, `unitPrice`, `totalCents`, `name`)
   * are strictly ignored in favor of authoritative SQLite `catalog_items` values.
   * @param {{
   *   partnerId: string,
   *   items: Array<{ itemId?: string, item_id?: string, catalogItemId?: string, catalog_item_id?: string, qty?: number, quantity?: number, itemVersionHash?: string }>,
   *   clientName: string,
   *   customerPhone?: string | null,
   *   customerId?: string | null,
   *   paymentMethod?: string | null,
   *   deliveryType?: string | null,
   *   address?: string | null,
   *   notes?: string | null,
   *   confirmed: boolean,
   *   idempotencyKey?: string | null
   * }} params
   */
  createOrder(params = {}) {
    const {
      partnerId,
      items,
      clientName: rawClientName,
      customerPhone = null,
      customerId = null,
      paymentMethod = null,
      deliveryType = null,
      address = null,
      notes = null,
      confirmed,
      idempotencyKey = null,
    } = params;

    if (!partnerId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId é obrigatório.');
    }
    if (confirmed !== true) {
      throw new DomainError(
        'CONFIRMATION_REQUIRED',
        'Confirmação explícita (confirmed: true) é obrigatória para concluir o pedido.'
      );
    }
    const clientName = String(rawClientName || '').trim();
    if (!clientName) {
      throw new DomainError('VALIDATION_ERROR', 'clientName é obrigatório.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'O pedido deve conter ao menos 1 item.'
      );
    }

    return this.dbManager.transaction(() => {
      if (idempotencyKey) {
        const existingByKey = this.orderRepository.findByIdempotencyKey(
          idempotencyKey,
          { partnerId }
        );
        if (existingByKey) {
          return {
            ok: true,
            idempotent: true,
            order: existingByKey,
          };
        }
      }

      const resolvedSnapshots = [];
      let authoritativeTotalCents = 0;
      /** @type {Map<string, { item: Record<string, any>, qty: number }>} */
      const stockRequirements = new Map();

      for (const entry of items) {
        if (!entry || typeof entry !== 'object') {
          throw new DomainError('VALIDATION_ERROR', 'Item de pedido inválido.');
        }

        const itemId =
          entry.itemId ??
          entry.item_id ??
          entry.catalogItemId ??
          entry.catalog_item_id;
        const qty = Number(entry.qty ?? entry.quantity ?? 1);

        if (!itemId) {
          throw new DomainError(
            'VALIDATION_ERROR',
            'Cada item do pedido deve informar itemId.'
          );
        }
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new DomainError(
            'VALIDATION_ERROR',
            `Quantidade inválida para o item "${itemId}": ${qty}.`,
            { itemId, qty }
          );
        }

        const catalogItem = this.catalogRepository.findById(itemId, { partnerId });
        if (!catalogItem) {
          throw new DomainError(
            'CATALOG_NOT_FOUND',
            `Produto "${itemId}" não encontrado para este parceiro.`,
            { partnerId, itemId },
            404
          );
        }
        if (Number(catalogItem.active) !== 1) {
          throw new DomainError(
            'CATALOG_INACTIVE',
            `O produto "${catalogItem.name}" está desativado.`,
            { partnerId, itemId },
            409
          );
        }
        if (catalogItem.item_type !== 'PRODUCT') {
          throw new DomainError(
            'INVALID_ITEM_TYPE',
            `Não é possível pedir "${catalogItem.name}" porque é do tipo ${catalogItem.item_type}, e não PRODUCT.`,
            { partnerId, itemId, itemType: catalogItem.item_type },
            400
          );
        }
        if (
          entry.itemVersionHash &&
          entry.itemVersionHash !== catalogItem.version_hash
        ) {
          throw new DomainError(
            'VERSION_MISMATCH',
            `O produto "${catalogItem.name}" foi atualizado recentemente.`,
            {
              itemId,
              expectedVersionHash: entry.itemVersionHash,
              actualVersionHash: catalogItem.version_hash,
            },
            409
          );
        }

        if (Number(catalogItem.track_stock ?? 0) === 1) {
          const prev = stockRequirements.get(catalogItem.id);
          stockRequirements.set(catalogItem.id, {
            item: catalogItem,
            qty: (prev ? prev.qty : 0) + qty,
          });
        }

        // Authoritative SQLite price only — external price/total fields are ignored.
        const unitCents = Number(catalogItem.price_cents);
        const subtotalCents = unitCents * qty;
        authoritativeTotalCents += subtotalCents;

        resolvedSnapshots.push({
          catalog_item_id: catalogItem.id,
          name: catalogItem.name,
          price_cents: unitCents,
          qty,
          subtotal_cents: subtotalCents,
          version_hash: catalogItem.version_hash,
        });
      }

      // Atomic stock depletion check & decrement inside the same BEGIN IMMEDIATE transaction
      for (const [trackedItemId, req] of stockRequirements.entries()) {
        const dec = this.catalogRepository.decrementStockAtomic(
          trackedItemId,
          partnerId,
          req.qty
        );
        if (!dec.ok) {
          throw new DomainError(
            'INSUFFICIENT_STOCK',
            `Estoque insuficiente para "${req.item.name}". Disponível: ${dec.available ?? 0}, solicitado: ${req.qty}.`,
            {
              partnerId,
              itemId: trackedItemId,
              requested: req.qty,
              available: dec.available ?? 0,
            },
            409
          );
        }
      }

      try {
        const order = this.orderRepository.create({
          partnerId,
          customerId,
          clientName,
          customerPhone,
          items: resolvedSnapshots,
          totalCents: authoritativeTotalCents,
          paymentMethod,
          deliveryType,
          address,
          notes,
          status: 'CONFIRMED',
          idempotencyKey,
        });

        return {
          ok: true,
          idempotent: false,
          order,
        };
      } catch (err) {
        if (
          idempotencyKey &&
          err &&
          err.code === 'ERR_SQLITE_ERROR' &&
          /UNIQUE constraint failed/i.test(err.message)
        ) {
          const existing = this.orderRepository.findByIdempotencyKey(
            idempotencyKey,
            { partnerId }
          );
          if (existing) {
            return {
              ok: true,
              idempotent: true,
              order: existing,
            };
          }
        }
        throw err;
      }
    });
  }

  /**
   * Cancels an order belonging to `partnerId`.
   * @param {{ partnerId: string, orderId: string }} params
   */
  cancelOrder({ partnerId, orderId }) {
    if (!partnerId || !orderId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId e orderId são obrigatórios.');
    }

    return this.dbManager.transaction(() => {
      const existing = this.orderRepository.findById(orderId, { partnerId });
      if (!existing) {
        throw new DomainError(
          'ORDER_NOT_FOUND',
          `Pedido "${orderId}" não encontrado.`,
          { partnerId, orderId },
          404
        );
      }
      if (existing.status === 'CANCELLED') {
        return { ok: true, alreadyCancelled: true, order: existing };
      }
      const updated = this.orderRepository.cancel(orderId, { partnerId });
      return { ok: true, alreadyCancelled: false, order: updated };
    });
  }

  /**
   * Lists orders for a partner.
   * @param {string} partnerId
   * @param {{ status?: string, limit?: number, offset?: number }} [options]
   */
  listOrders(partnerId, options = {}) {
    return this.orderRepository.listByPartner(partnerId, options);
  }

  /**
   * Computes order summary for a partner (optionally filtered by YYYY-MM-DD prefix on created_at).
   * @param {string} partnerId
   * @param {string | null} [dateStr]
   */
  getSummary(partnerId, dateStr = null) {
    const all = this.orderRepository.listByPartner(partnerId, { limit: 1000 });
    const orders = dateStr
      ? all.filter((o) => String(o.created_at || '').startsWith(dateStr))
      : all;

    let confirmedCount = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;
    let totalRevenueCents = 0;

    for (const ord of orders) {
      if (ord.status === 'CONFIRMED') {
        confirmedCount += 1;
        totalRevenueCents += Number(ord.total_cents || 0);
      } else if (ord.status === 'DELIVERED') {
        deliveredCount += 1;
        totalRevenueCents += Number(ord.total_cents || 0);
      } else if (ord.status === 'CANCELLED') {
        cancelledCount += 1;
      }
    }

    return {
      partnerId,
      dateStr,
      totalCount: orders.length,
      confirmedCount,
      deliveredCount,
      cancelledCount,
      totalRevenueCents,
      totalRevenueLabel: formatPriceCents(totalRevenueCents),
    };
  }
}

module.exports = { OrderService };
