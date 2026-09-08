class SchedulerEngine {
  constructor(runtimeCore, surfaceBridge, whatsappBridge) {
    this.runtimeCore = runtimeCore;
    this.surfaceBridge = surfaceBridge;
    this.whatsappBridge = whatsappBridge;
    this.reminders = [];
    this.timers = new Map();

    this._initTable();
  }

  _initTable() {
    if (this.runtimeCore && typeof this.runtimeCore.getDb === 'function') {
      try {
        const db = this.runtimeCore.getDb();
        db.exec(`
          CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            text TEXT,
            alert_at TEXT,
            target_channel TEXT,
            status TEXT DEFAULT 'PENDING'
          );
        `);
      } catch (_) { /* Best effort on SQLite */ }
    }
  }

  addReminder({ userId = 'default_user', text, alertAt, targetChannel = 'UI' }) {
    if (!text) throw new Error('[SCHEDULER_FAULT] Texto do lembrete é obrigatório.');

    const alertTime = new Date(alertAt).getTime();
    const now = Date.now();
    const delay = Math.max(0, alertTime - now);

    const reminder = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      userId,
      text,
      alertAt: new Date(alertAt).toISOString(),
      targetChannel,
      status: 'PENDING'
    };

    // Save to DB if runtimeCore available
    if (this.runtimeCore && typeof this.runtimeCore.getDb === 'function') {
      try {
        const db = this.runtimeCore.getDb();
        const stmt = db.prepare(`
          INSERT INTO reminders (user_id, text, alert_at, target_channel, status)
          VALUES (?, ?, ?, ?, ?)
        `);
        const info = stmt.run(userId, text, reminder.alertAt, targetChannel, 'PENDING');
        if (info && info.lastInsertRowid) {
          reminder.id = Number(info.lastInsertRowid);
        }
      } catch (_) { /* fallback */ }
    }

    this.reminders.push(reminder);

    // Schedule timer
    const timerId = setTimeout(() => {
      this.triggerAlert(reminder);
    }, delay);

    this.timers.set(reminder.id, timerId);

    return reminder;
  }

  triggerAlert(reminder) {
    reminder.status = 'TRIGGERED';

    // Update DB
    if (this.runtimeCore && typeof this.runtimeCore.getDb === 'function') {
      try {
        const db = this.runtimeCore.getDb();
        db.prepare(`UPDATE reminders SET status = 'TRIGGERED' WHERE id = ?`).run(reminder.id);
      } catch (_) {}
    }

    // Dispatch to SurfaceBridge
    if (this.surfaceBridge && typeof this.surfaceBridge.emit === 'function') {
      this.surfaceBridge.emit('REMINDER_ALERT', reminder);
    }

    // Dispatch to WhatsApp if targetChannel === 'WHATSAPP'
    if (reminder.targetChannel === 'WHATSAPP' && this.whatsappBridge && typeof this.whatsappBridge.onIncomingMessage === 'function') {
      try {
        this.whatsappBridge.onIncomingMessage(`[ALERTA-AGENDA] Lembrete: ${reminder.text}`, '5511999999999');
      } catch (_) {}
    }

    this.timers.delete(reminder.id);
    return reminder;
  }

  listPendingReminders(userId = 'default_user') {
    if (this.runtimeCore && typeof this.runtimeCore.getDb === 'function') {
      try {
        const db = this.runtimeCore.getDb();
        const rows = db.prepare(`SELECT * FROM reminders WHERE user_id = ? AND status = 'PENDING'`).all(userId);
        return rows.map(r => ({
          id: r.id,
          userId: r.user_id,
          text: r.text,
          alertAt: r.alert_at,
          targetChannel: r.target_channel,
          status: r.status
        }));
      } catch (_) {}
    }

    return this.reminders.filter(r => r.userId === userId && r.status === 'PENDING');
  }

  clearAllTimers() {
    for (const timerId of this.timers.values()) {
      clearTimeout(timerId);
    }
    this.timers.clear();
  }
}

module.exports = SchedulerEngine;
