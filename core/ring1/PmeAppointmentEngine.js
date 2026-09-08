class PmeAppointmentEngine {
  constructor(runtimeCore, _unused, configurator) {
    this.runtimeCore = runtimeCore;
    this.configurator = configurator;
    this.inMemoryBookings = new Set();

    this._initTable();
  }

  _initTable() {
    if (this.runtimeCore && typeof this.runtimeCore.getDb === 'function') {
      try {
        const db = this.runtimeCore.getDb();
        // Colunas legadas mantidas por compatibilidade de schema; sem fluxo financeiro.
        db.exec(`
          CREATE TABLE IF NOT EXISTS pme_appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT,
            service_id TEXT,
            date_str TEXT,
            time_slot TEXT,
            lock_signal_brl REAL,
            status TEXT DEFAULT 'CONFIRMED',
            pix_tx_id TEXT,
            created_at TEXT
          );
        `);
      } catch (_) {}
    }
  }

  async bookAppointment({ customerId, serviceId, dateStr = '2026-08-10', timeSlot = '10:00' }) {
    if (!customerId || !serviceId) {
      throw new Error('[PME_BOOKING_FAULT] customerId e serviceId são obrigatórios.');
    }

    const bookingKey = `${dateStr}_${timeSlot}`;

    // SQLite Concurrency Mutex (BEGIN IMMEDIATE)
    if (this.runtimeCore && typeof this.runtimeCore.getDb === 'function') {
      const db = this.runtimeCore.getDb();
      try {
        db.exec('BEGIN IMMEDIATE');

        // Inclui status legado PENDING_PIX para não permitir colisão com reservas antigas
        const existing = db.prepare(`
          SELECT id FROM pme_appointments
          WHERE date_str = ? AND time_slot = ?
            AND status IN ('CONFIRMED', 'PENDING', 'PENDING_PIX')
        `).get(dateStr, timeSlot);

        if (existing) {
          db.exec('ROLLBACK');
          throw new Error(`[PME_BOOKING_COLLISION] O horário ${timeSlot} na data ${dateStr} já está reservado.`);
        }

        const stmt = db.prepare(`
          INSERT INTO pme_appointments (customer_id, service_id, date_str, time_slot, lock_signal_brl, status, pix_tx_id, created_at)
          VALUES (?, ?, ?, ?, ?, 'CONFIRMED', ?, ?)
        `);
        const info = stmt.run(
          customerId,
          serviceId,
          dateStr,
          timeSlot,
          null,
          null,
          new Date().toISOString()
        );

        db.exec('COMMIT');

        if (this.configurator) {
          this.configurator.appointments.push({ dateStr, timeSlot, customerId });
        }

        return {
          appointmentId: Number(info.lastInsertRowid),
          customerId,
          serviceId,
          dateStr,
          timeSlot,
          status: 'CONFIRMED'
        };

      } catch (err) {
        try { db.exec('ROLLBACK'); } catch (_) {}
        throw err;
      }
    } else {
      // In-Memory Mutex Fallback
      if (this.inMemoryBookings.has(bookingKey)) {
        throw new Error(`[PME_BOOKING_COLLISION] O horário ${timeSlot} na data ${dateStr} já está reservado.`);
      }
      this.inMemoryBookings.add(bookingKey);

      if (this.configurator) {
        this.configurator.appointments.push({ dateStr, timeSlot, customerId });
      }

      return {
        appointmentId: Date.now(),
        customerId,
        serviceId,
        dateStr,
        timeSlot,
        status: 'CONFIRMED'
      };
    }
  }
}

module.exports = PmeAppointmentEngine;
