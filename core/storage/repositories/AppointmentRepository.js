'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

const VALID_APPOINTMENT_STATUSES = new Set(['CONFIRMED', 'CANCELLED', 'COMPLETED']);

/**
 * Repository for service appointments (`appointments`) and reminders (`reminders`).
 * Enforces atomic double-booking protection via `idx_appointments_unique_slot`
 * and preserves historical catalog snapshots.
 */
class AppointmentRepository {
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
   * Creates an appointment inside an atomic BEGIN IMMEDIATE transaction.
   * When snapshot fields are omitted, resolves and snapshots them from `catalog_items`
   * (requiring an active SERVICE item).
   * @param {Record<string, unknown>} data
   */
  create(data) {
    const id = data.id || crypto.randomUUID();
    const partnerId = data.partnerId ?? data.partner_id;
    const customerId = data.customerId ?? data.customer_id ?? null;
    const catalogItemId = data.catalogItemId ?? data.catalog_item_id;
    const clientName = String(data.clientName ?? data.client_name ?? '').trim();
    const customerPhone = data.customerPhone ?? data.customer_phone ?? null;
    const dateStr = String(data.dateStr ?? data.date_str ?? '').trim();
    const timeSlot = String(data.timeSlot ?? data.time_slot ?? '').trim();
    const status = String(data.status || 'CONFIRMED').toUpperCase();
    const idempotencyKey = data.idempotencyKey ?? data.idempotency_key ?? null;
    const externalCalendarId =
      data.externalCalendarId ?? data.external_calendar_id ?? null;

    if (!partnerId || !catalogItemId || !clientName || !dateStr || !timeSlot) {
      throw new Error(
        'AppointmentRepository.create requires partnerId, catalogItemId, clientName, dateStr, and timeSlot'
      );
    }
    if (!VALID_APPOINTMENT_STATUSES.has(status)) {
      throw new Error(`Invalid appointment status: ${status}`);
    }

    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      let itemNameSnapshot = data.itemNameSnapshot ?? data.item_name_snapshot;
      let priceCentsSnapshot =
        data.priceCentsSnapshot ?? data.price_cents_snapshot;
      let durationMinutesSnapshot =
        data.durationMinutesSnapshot ?? data.duration_minutes_snapshot;

      if (
        itemNameSnapshot === undefined ||
        priceCentsSnapshot === undefined ||
        durationMinutesSnapshot === undefined
      ) {
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
        if (catalogItem.item_type !== 'SERVICE') {
          throw new Error(
            `Cannot book non-SERVICE catalog item: ${catalogItemId} (${catalogItem.item_type})`
          );
        }

        itemNameSnapshot = itemNameSnapshot ?? catalogItem.name;
        priceCentsSnapshot =
          priceCentsSnapshot ?? Number(catalogItem.price_cents);
        durationMinutesSnapshot =
          durationMinutesSnapshot ?? Number(catalogItem.duration_minutes);
      }

      db.prepare(
        `INSERT INTO appointments (
          id, partner_id, customer_id, catalog_item_id,
          item_name_snapshot, price_cents_snapshot, duration_minutes_snapshot,
          client_name, customer_phone, date_str, time_slot, status,
          idempotency_key, external_calendar_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        partnerId,
        customerId,
        catalogItemId,
        String(itemNameSnapshot),
        Number(priceCentsSnapshot),
        Number(durationMinutesSnapshot),
        clientName,
        customerPhone,
        dateStr,
        timeSlot,
        status,
        idempotencyKey,
        externalCalendarId
      );

      return DatabaseManager.toPlain(
        db.prepare('SELECT * FROM appointments WHERE id = ?').get(id)
      );
    });
  }

  /**
   * Finds an appointment by primary key, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  findById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare('SELECT * FROM appointments WHERE id = ? AND partner_id = ?')
          .get(id, partnerId)
      : this._db().prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    return DatabaseManager.toPlain(row);
  }

  /**
   * Finds an appointment by idempotency key, optionally scoped by `partnerId`.
   * @param {string} idempotencyKey
   * @param {string | { partnerId?: string }} [options]
   */
  findByIdempotencyKey(idempotencyKey, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare(
            'SELECT * FROM appointments WHERE idempotency_key = ? AND partner_id = ?'
          )
          .get(idempotencyKey, partnerId)
      : this._db()
          .prepare('SELECT * FROM appointments WHERE idempotency_key = ?')
          .get(idempotencyKey);
    return DatabaseManager.toPlain(row);
  }

  /**
   * Lists appointments for a partner, optionally filtered by `dateStr` and `status`.
   * @param {string} partnerId
   * @param {{ dateStr?: string, status?: string, limit?: number }} [options]
   */
  listByPartner(partnerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 200;
    const clauses = ['partner_id = ?'];
    const params = [partnerId];

    if (options.dateStr) {
      clauses.push('date_str = ?');
      params.push(String(options.dateStr));
    }
    if (options.status) {
      clauses.push('status = ?');
      params.push(String(options.status).toUpperCase());
    }
    params.push(limit);

    return this._db()
      .prepare(
        `SELECT * FROM appointments
         WHERE ${clauses.join(' AND ')}
         ORDER BY date_str ASC, time_slot ASC, id ASC
         LIMIT ?`
      )
      .all(...params)
      .map(DatabaseManager.toPlain);
  }

  /**
   * Lists appointments for a partner on a given date.
   * @param {string} partnerId
   * @param {string} dateStr
   * @param {{ status?: string }} [options]
   */
  listByPartnerAndDate(partnerId, dateStr, options = {}) {
    if (options.status) {
      return this._db()
        .prepare(
          `SELECT * FROM appointments
           WHERE partner_id = ? AND date_str = ? AND status = ?
           ORDER BY time_slot ASC, id ASC`
        )
        .all(partnerId, dateStr, String(options.status).toUpperCase())
        .map(DatabaseManager.toPlain);
    }

    return this._db()
      .prepare(
        `SELECT * FROM appointments
         WHERE partner_id = ? AND date_str = ?
         ORDER BY time_slot ASC, id ASC`
      )
      .all(partnerId, dateStr)
      .map(DatabaseManager.toPlain);
  }

  /**
   * Lists appointments for a customer, optionally scoped by `partnerId`.
   * @param {string} customerId
   * @param {{ limit?: number, partnerId?: string }} [options]
   */
  listByCustomer(customerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const partnerId = DatabaseManager.extractPartnerId(options);
    const sql = partnerId
      ? `SELECT * FROM appointments
         WHERE customer_id = ? AND partner_id = ?
         ORDER BY date_str DESC, time_slot DESC
         LIMIT ?`
      : `SELECT * FROM appointments
         WHERE customer_id = ?
         ORDER BY date_str DESC, time_slot DESC
         LIMIT ?`;
    const params = partnerId ? [customerId, partnerId, limit] : [customerId, limit];
    return this._db()
      .prepare(sql)
      .all(...params)
      .map(DatabaseManager.toPlain);
  }

  /**
   * Updates appointment status and optional external_calendar_id.
   * Optionally scoped by `partnerId`.
   * @param {string} id
   * @param {'CONFIRMED' | 'CANCELLED' | 'COMPLETED'} status
   * @param {{ externalCalendarId?: string, partnerId?: string }} [options]
   */
  updateStatus(id, status, options = {}) {
    const normalized = String(status).toUpperCase();
    if (!VALID_APPOINTMENT_STATUSES.has(normalized)) {
      throw new Error(`Invalid appointment status: ${status}`);
    }
    const partnerId = DatabaseManager.extractPartnerId(options);
    const whereClause = partnerId ? 'id = ? AND partner_id = ?' : 'id = ?';

    if (options.externalCalendarId !== undefined) {
      const params = [normalized, options.externalCalendarId, id];
      if (partnerId) params.push(partnerId);
      this._db()
        .prepare(
          `UPDATE appointments
           SET status = ?, external_calendar_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE ${whereClause}`
        )
        .run(...params);
    } else {
      const params = [normalized, id];
      if (partnerId) params.push(partnerId);
      this._db()
        .prepare(
          `UPDATE appointments
           SET status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE ${whereClause}`
        )
        .run(...params);
    }

    return this.findById(id, { partnerId });
  }

  /**
   * Cancels an appointment, releasing its unique confirmed slot.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  cancel(id, options = {}) {
    return this.updateStatus(id, 'CANCELLED', options);
  }

  /**
   * Marks an appointment as completed.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  complete(id, options = {}) {
    return this.updateStatus(id, 'COMPLETED', options);
  }

  /**
   * Schedules a reminder linked to an appointment.
   * @param {{ id?: string, partnerId: string, appointmentId: string, recipientId: string, fireAt: number, status?: string }} data
   */
  createReminder(data) {
    const id = data.id || crypto.randomUUID();
    const partnerId = data.partnerId ?? data.partner_id;
    const appointmentId = data.appointmentId ?? data.appointment_id;
    const recipientId = data.recipientId ?? data.recipient_id;
    const fireAt = Number(data.fireAt ?? data.fire_at);
    const status = String(data.status || 'PENDING');

    this._db()
      .prepare(
        `INSERT INTO reminders (id, partner_id, appointment_id, recipient_id, fire_at, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, partnerId, appointmentId, recipientId, Math.trunc(fireAt), status);

    return DatabaseManager.toPlain(
      this._db().prepare('SELECT * FROM reminders WHERE id = ?').get(id)
    );
  }

  /**
   * Lists pending reminders due on or before `beforeMs`.
   * Optionally scoped by `partnerId`.
   * @param {number} [beforeMs]
   * @param {string | { partnerId?: string }} [options]
   */
  listPendingReminders(beforeMs = Date.now(), options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const sql = partnerId
      ? `SELECT * FROM reminders
         WHERE status = 'PENDING' AND fire_at <= ? AND partner_id = ?
         ORDER BY fire_at ASC`
      : `SELECT * FROM reminders
         WHERE status = 'PENDING' AND fire_at <= ?
         ORDER BY fire_at ASC`;
    const params = partnerId
      ? [Math.trunc(beforeMs), partnerId]
      : [Math.trunc(beforeMs)];
    return this._db()
      .prepare(sql)
      .all(...params)
      .map(DatabaseManager.toPlain);
  }

  /**
   * Updates reminder status, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string} status
   * @param {string | { partnerId?: string }} [options]
   */
  markReminderStatus(id, status, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    if (partnerId) {
      this._db()
        .prepare('UPDATE reminders SET status = ? WHERE id = ? AND partner_id = ?')
        .run(String(status), id, partnerId);
      return DatabaseManager.toPlain(
        this._db()
          .prepare('SELECT * FROM reminders WHERE id = ? AND partner_id = ?')
          .get(id, partnerId)
      );
    }
    this._db()
      .prepare('UPDATE reminders SET status = ? WHERE id = ?')
      .run(String(status), id);
    return DatabaseManager.toPlain(
      this._db().prepare('SELECT * FROM reminders WHERE id = ?').get(id)
    );
  }
}

module.exports = { AppointmentRepository };
