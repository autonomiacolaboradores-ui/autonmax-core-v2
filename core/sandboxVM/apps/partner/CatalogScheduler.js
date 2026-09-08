/**
 * MAX.Catalog Scheduler — AUTON.MAX v2.0 (Block 11)
 * Product catalog + atomic slot reservation
 * RFC-A111
 */

'use strict';

const crypto = require('crypto');

class CatalogScheduler {
  constructor() {
    /** sku → product */
    this._products = new Map();
    /** slotId → { start, end, capacity, reserved } */
    this._slots = new Map();
    /** reservationId → { slotId, customerId, status } */
    this._reservations = new Map();
  }

  addProduct(product) {
    const sku = product.sku || crypto.randomUUID();
    const entry = {
      sku,
      name: product.name || 'Item',
      price: Number(product.price) || 0,
      currency: product.currency || 'BRL',
      category: product.category || 'geral',
      active: product.active !== false,
    };
    this._products.set(sku, entry);
    return entry;
  }

  listProducts(filter = {}) {
    let items = Array.from(this._products.values()).filter((p) => p.active);
    if (filter.category) items = items.filter((p) => p.category === filter.category);
    return items;
  }

  getProduct(sku) {
    return this._products.get(sku) || null;
  }

  /**
   * Register an available time slot.
   * @param {{ start: number, end: number, capacity?: number }} slot
   */
  addSlot(slot) {
    const id = slot.id || crypto.randomUUID();
    this._slots.set(id, {
      id,
      start: slot.start,
      end: slot.end,
      capacity: slot.capacity ?? 1,
      reserved: 0,
    });
    return id;
  }

  listAvailableSlots(fromTs, toTs) {
    return Array.from(this._slots.values()).filter((s) => {
      if (s.reserved >= s.capacity) return false;
      if (fromTs && s.end < fromTs) return false;
      if (toTs && s.start > toTs) return false;
      return true;
    });
  }

  /**
   * Atomic reservation — fails if capacity exhausted.
   */
  reserveSlot(slotId, customerId) {
    const slot = this._slots.get(slotId);
    if (!slot) return { ok: false, error: 'slot_not_found' };
    if (slot.reserved >= slot.capacity) {
      return { ok: false, error: 'slot_full' };
    }
    slot.reserved += 1;
    const reservationId = crypto.randomUUID();
    this._reservations.set(reservationId, {
      reservationId,
      slotId,
      customerId,
      status: 'confirmed',
      createdAt: Date.now(),
    });
    return { ok: true, reservationId, slot };
  }

  cancelReservation(reservationId) {
    const r = this._reservations.get(reservationId);
    if (!r || r.status === 'cancelled') return { ok: false };
    r.status = 'cancelled';
    const slot = this._slots.get(r.slotId);
    if (slot && slot.reserved > 0) slot.reserved -= 1;
    return { ok: true };
  }
}

module.exports = { CatalogScheduler };
