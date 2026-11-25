'use strict';

const { CatalogRepository } = require('../storage/repositories/CatalogRepository');
const { DomainError, formatPriceCents } = require('./RegionalNormalizer');

const VALID_TYPES = new Set(['SERVICE', 'PRODUCT']);

/**
 * Formats a persisted catalog row into a canonical domain item representation.
 * @param {Record<string, unknown> | null} row
 */
function toDomainItem(row) {
  if (!row) return null;
  return {
    ...row,
    price_cents: Number(row.price_cents),
    duration_minutes: Number(row.duration_minutes),
    active: Number(row.active),
    track_stock: Number(row.track_stock ?? 0),
    stock_quantity:
      row.stock_quantity !== null && row.stock_quantity !== undefined
        ? Number(row.stock_quantity)
        : null,
    price_label: formatPriceCents(row.price_cents),
  };
}

/**
 * Domain service for catalog items (`SERVICE` and `PRODUCT`) enforcing canonical
 * SHA-256 `version_hash`, non-negative integer pricing in cents, and soft-delete.
 */
class CatalogService {
  /**
   * @param {{ dbManager?: import('../storage/DatabaseManager').DatabaseManager, catalogRepository?: CatalogRepository }} deps
   */
  constructor(deps = {}) {
    if (!deps.catalogRepository && !deps.dbManager) {
      throw new Error('CatalogService requires catalogRepository or dbManager');
    }
    this.dbManager = deps.dbManager || null;
    this.catalogRepository =
      deps.catalogRepository || new CatalogRepository(deps.dbManager);
  }

  /**
   * Creates a catalog item and computes its canonical SHA-256 `version_hash`.
   * @param {string} partnerId
   * @param {Record<string, unknown>} data
   */
  createItem(partnerId, data = {}) {
    if (!partnerId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId é obrigatório.');
    }

    const itemType = String(
      (data.itemType ?? data.item_type ?? data.type) || ''
    ).toUpperCase();
    const name = String(data.name || '').trim();
    const description = String(data.description ?? '');
    const priceCents = Number(data.priceCents ?? data.price_cents);
    const durationMinutes =
      data.durationMinutes !== undefined
        ? Number(data.durationMinutes)
        : data.duration_minutes !== undefined
          ? Number(data.duration_minutes)
          : 30;

    if (!name) {
      throw new DomainError('VALIDATION_ERROR', 'Nome do item é obrigatório.');
    }
    if (!VALID_TYPES.has(itemType)) {
      throw new DomainError(
        'INVALID_ITEM_TYPE',
        `Tipo de item inválido: "${itemType}". Esperado SERVICE ou PRODUCT.`,
        { itemType }
      );
    }
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'priceCents deve ser um inteiro maior ou igual a zero.',
        { priceCents }
      );
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'durationMinutes deve ser um inteiro positivo.',
        { durationMinutes }
      );
    }

    const created = this.catalogRepository.create({
      id: data.id,
      partnerId,
      itemType,
      name,
      description,
      priceCents,
      durationMinutes,
      category: data.category ?? 'geral',
      active: data.active !== undefined ? data.active : true,
      trackStock: data.trackStock ?? data.track_stock ?? false,
      stockQuantity: data.stockQuantity ?? data.stock_quantity ?? null,
    });

    return toDomainItem(created);
  }

  /**
   * Retrieves the authoritative specification of a catalog item scoped by partnerId.
   * @param {string} partnerId
   * @param {string} itemId
   * @param {{ includeInactive?: boolean }} [options]
   */
  getItemSpec(partnerId, itemId, options = {}) {
    const item = this.catalogRepository.findById(itemId, { partnerId });
    if (!item) {
      throw new DomainError(
        'CATALOG_NOT_FOUND',
        `Item de catálogo "${itemId}" não encontrado para este parceiro.`,
        { partnerId, itemId },
        404
      );
    }
    if (!options.includeInactive && Number(item.active) !== 1) {
      throw new DomainError(
        'CATALOG_INACTIVE',
        `Item de catálogo "${item.name}" está desativado.`,
        { partnerId, itemId },
        409
      );
    }
    return toDomainItem(item);
  }

  /**
   * Lists catalog items for a partner.
   * @param {string} partnerId
   * @param {{ type?: string, itemType?: string, category?: string, includeInactive?: boolean }} [options]
   */
  listItems(partnerId, options = {}) {
    const itemType = options.itemType || options.type;
    return this.catalogRepository
      .listByPartner(partnerId, {
        includeInactive: Boolean(options.includeInactive),
        itemType,
        category: options.category,
      })
      .map(toDomainItem);
  }

  /**
   * Updates a catalog item scoped to `partnerId` and recalculates `version_hash`.
   * @param {string} partnerId
   * @param {string} itemId
   * @param {Record<string, unknown>} patch
   */
  updateItem(partnerId, itemId, patch = {}) {
    const existing = this.catalogRepository.findById(itemId, { partnerId });
    if (!existing) {
      throw new DomainError(
        'CATALOG_NOT_FOUND',
        `Item de catálogo "${itemId}" não encontrado para este parceiro.`,
        { partnerId, itemId },
        404
      );
    }

    const normalizedPatch = { ...patch };
    if (patch.type !== undefined && patch.itemType === undefined && patch.item_type === undefined) {
      normalizedPatch.itemType = patch.type;
    }

    if (
      normalizedPatch.itemType !== undefined &&
      !VALID_TYPES.has(String(normalizedPatch.itemType).toUpperCase())
    ) {
      throw new DomainError(
        'INVALID_ITEM_TYPE',
        `Tipo de item inválido: "${normalizedPatch.itemType}".`,
        { itemType: normalizedPatch.itemType }
      );
    }

    const updated = this.catalogRepository.update(itemId, normalizedPatch, { partnerId });
    return toDomainItem(updated);
  }

  /**
   * Soft-deletes (deactivates) a catalog item without altering historical records.
   * @param {string} partnerId
   * @param {string} itemId
   */
  deactivateItem(partnerId, itemId) {
    return this.updateItem(partnerId, itemId, { active: false });
  }

  /**
   * Alias for deactivateItem.
   * @param {string} partnerId
   * @param {string} itemId
   */
  softDeleteItem(partnerId, itemId) {
    return this.deactivateItem(partnerId, itemId);
  }

  /**
   * Reactivates a soft-deleted catalog item.
   * @param {string} partnerId
   * @param {string} itemId
   */
  activateItem(partnerId, itemId) {
    return this.updateItem(partnerId, itemId, { active: true });
  }

  /**
   * Formats a catalog item line for ContextBuilder prompt injection (Doc 01 Elo 1):
   * `[id] Nome — R$ XX,XX (Tipo)`
   * @param {Record<string, unknown>} item
   * @returns {string}
   */
  static formatContextLine(item) {
    return `[${item.id}] ${item.name} — ${formatPriceCents(item.price_cents)} (${item.item_type})`;
  }
}

module.exports = { CatalogService, toDomainItem };
