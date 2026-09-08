'use strict';

/**
 * MetricsEventLog — OPS-4
 * Contagens reais por partnerId/dia (não seed). Persistência JSONL + agregação.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROOT = path.join(__dirname, '../../workspace/metrics');

const EVENT_TYPES = [
  'conversations_started',
  'messages_in',
  'appointments_created',
  'appointments_cancelled',
  'catalog_answered',
  'handoff_human',
  'paused',
  'unresolved',
  'wa_session_down',
  'wa_qr_required',
  'wa_reconnect_ok',
  // Funil de agenda (elite)
  'booking_started',
  'booking_confirmed',
  'booking_conflict',
  'catalog_miss'
];

class MetricsEventLog {
  constructor(options = {}) {
    this.rootDir = options.rootDir || DEFAULT_ROOT;
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  _dayKey(d = new Date()) {
    return d.toISOString().slice(0, 10);
  }

  _fileFor(partnerId, day) {
    const pid = String(partnerId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(this.rootDir, pid);
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, `${day}.jsonl`);
  }

  /**
   * @param {{ type: string, partnerId?: string, sessionKey?: string, meta?: object }} ev
   */
  record(ev = {}) {
    const type = String(ev.type || '');
    if (!EVENT_TYPES.includes(type)) {
      return { ok: false, reason: 'UNKNOWN_EVENT_TYPE', type };
    }
    const partnerId = ev.partnerId || 'default';
    const day = this._dayKey(ev.at ? new Date(ev.at) : new Date());
    const row = {
      ts: new Date().toISOString(),
      type,
      partnerId,
      sessionKey: ev.sessionKey || null,
      meta: ev.meta || {}
    };
    const file = this._fileFor(partnerId, day);
    fs.appendFileSync(file, JSON.stringify(row) + '\n');
    return { ok: true, day, partnerId, type };
  }

  /**
   * Aggregate counts for partner/day.
   */
  aggregate(partnerId, day) {
    const file = this._fileFor(partnerId, day || this._dayKey());
    const counts = {};
    for (const t of EVENT_TYPES) counts[t] = 0;
    if (!fs.existsSync(file)) {
      return { partnerId, day: day || this._dayKey(), counts, events: 0, source: true };
    }
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (counts[row.type] != null) counts[row.type]++;
      } catch (_) {}
    }
    return {
      partnerId,
      day: day || this._dayKey(),
      counts,
      events: lines.length,
      source: false
    };
  }

  listPartnerDays(partnerId) {
    const pid = String(partnerId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = path.join(this.rootDir, pid);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => f.replace(/\.jsonl$/, ''))
      .sort();
  }
}

/** Singleton for process-wide increments */
let _global = null;
function getMetricsLog(options) {
  if (!_global) _global = new MetricsEventLog(options);
  return _global;
}

module.exports = {
  MetricsEventLog,
  getMetricsLog,
  EVENT_TYPES
};
