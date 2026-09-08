'use strict';

/**
 * MaxRuntimeExcellence — R1.4 tópicos 1–10 (runtime)
 * FSM · idempotência · circuit breaker · rate limit · replay · health · canary · traces
 * Sem UI.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '../../workspace/runtime_excellence');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const PME_TRANSITIONS = {
  INITIAL: ['GREETING', 'DISCOVERY', 'QUOTE', 'BOOKING', 'GENERAL'],
  GREETING: ['DISCOVERY', 'QUOTE', 'BOOKING', 'GENERAL', 'DONE'],
  DISCOVERY: ['QUOTE', 'BOOKING', 'GENERAL', 'GREETING'],
  QUOTE: ['BOOKING', 'CONFIRM', 'DISCOVERY', 'GENERAL'],
  BOOKING: ['CONFIRM', 'QUOTE', 'GENERAL'],
  CONFIRM: ['DONE', 'BOOKING', 'GENERAL'],
  DONE: ['GREETING', 'DISCOVERY', 'GENERAL'],
  GENERAL: ['GREETING', 'DISCOVERY', 'QUOTE', 'BOOKING', 'CONFIRM', 'DONE']
};

const INTENT_TO_STATE = {
  greeting: 'GREETING',
  catalog: 'DISCOVERY',
  pricing: 'QUOTE',
  hours: 'DISCOVERY',
  policies: 'DISCOVERY',
  location: 'DISCOVERY',
  duration: 'QUOTE',
  booking: 'BOOKING',
  cancel: 'BOOKING',
  thanks: 'DONE',
  general: 'GENERAL'
};

class ToolCircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 3;
    this.cooldownMs = options.cooldownMs || 60_000;
    /** @type {Map<string, { fails: number, openUntil: number }>} */
    this.state = new Map();
  }

  _key(tool) {
    return String(tool || 'unknown');
  }

  isOpen(tool) {
    const s = this.state.get(this._key(tool));
    if (!s) return false;
    if (s.openUntil && Date.now() < s.openUntil) return true;
    if (s.openUntil && Date.now() >= s.openUntil) {
      s.fails = 0;
      s.openUntil = 0;
    }
    return false;
  }

  recordSuccess(tool) {
    const k = this._key(tool);
    this.state.set(k, { fails: 0, openUntil: 0 });
  }

  recordFailure(tool) {
    const k = this._key(tool);
    const s = this.state.get(k) || { fails: 0, openUntil: 0 };
    s.fails += 1;
    if (s.fails >= this.failureThreshold) {
      s.openUntil = Date.now() + this.cooldownMs;
    }
    this.state.set(k, s);
    return s;
  }

  status() {
    const out = {};
    for (const [k, v] of this.state) {
      out[k] = { ...v, open: this.isOpen(k) };
    }
    return out;
  }
}

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60_000;
    this.maxPerWindow = options.maxPerWindow || 30;
    /** @type {Map<string, number[]>} */
    this.hits = new Map();
  }

  allow(key) {
    const k = String(key || 'default');
    const now = Date.now();
    let arr = this.hits.get(k) || [];
    arr = arr.filter((t) => now - t < this.windowMs);
    if (arr.length >= this.maxPerWindow) {
      this.hits.set(k, arr);
      return { ok: false, remaining: 0, retryAfterMs: this.windowMs - (now - arr[0]) };
    }
    arr.push(now);
    this.hits.set(k, arr);
    return { ok: true, remaining: this.maxPerWindow - arr.length };
  }
}

class BookingIdempotency {
  constructor(options = {}) {
    this.dir = options.dir || path.join(ROOT, 'idempotency');
    ensureDir(this.dir);
    /** @type {Map<string, object>} */
    this.mem = new Map();
  }

  fingerprint({ partnerId, remoteJid, clientName, serviceName, dateStr, timeSlot }) {
    const raw = [
      partnerId || '',
      remoteJid || '',
      String(clientName || '').toLowerCase().trim(),
      String(serviceName || '').toLowerCase().trim(),
      dateStr || '',
      timeSlot || ''
    ].join('|');
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  _path(fp) {
    return path.join(this.dir, `${fp}.json`);
  }

  get(fp) {
    if (this.mem.has(fp)) return this.mem.get(fp);
    try {
      const p = this._path(fp);
      if (!fs.existsSync(p)) return null;
      const row = JSON.parse(fs.readFileSync(p, 'utf8'));
      this.mem.set(fp, row);
      return row;
    } catch (_) {
      return null;
    }
  }

  put(fp, result) {
    const row = {
      fingerprint: fp,
      result,
      at: new Date().toISOString()
    };
    this.mem.set(fp, row);
    try {
      const tmp = this._path(fp) + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(row, null, 2));
      fs.renameSync(tmp, this._path(fp));
    } catch (_) {}
    return row;
  }
}

class ConversationReplay {
  constructor(options = {}) {
    this.dir = options.dir || path.join(ROOT, 'replay');
    ensureDir(this.dir);
  }

  _file(partnerId, remoteJid) {
    const safe = `${partnerId || 'p'}_${String(remoteJid || 'j').replace(/[^a-zA-Z0-9@._-]/g, '_')}`;
    return path.join(this.dir, `${safe}.jsonl`);
  }

  append(partnerId, remoteJid, turn) {
    try {
      const line = JSON.stringify({ ...turn, ts: new Date().toISOString() }) + '\n';
      fs.appendFileSync(this._file(partnerId, remoteJid), line);
    } catch (_) {}
  }

  loadLast(partnerId, remoteJid, n = 12) {
    try {
      const f = this._file(partnerId, remoteJid);
      if (!fs.existsSync(f)) return [];
      const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
      return lines.slice(-n).map((l) => {
        try {
          return JSON.parse(l);
        } catch (_) {
          return null;
        }
      }).filter(Boolean);
    } catch (_) {
      return [];
    }
  }
}

class TraceLog {
  constructor(options = {}) {
    this.dir = options.dir || path.join(ROOT, 'traces');
    ensureDir(this.dir);
  }

  start(messageId, meta = {}) {
    return {
      messageId: messageId || crypto.randomBytes(8).toString('hex'),
      startedAt: Date.now(),
      meta,
      steps: []
    };
  }

  step(trace, name, detail = {}) {
    if (!trace) return;
    trace.steps.push({ name, at: Date.now(), ...detail });
  }

  end(trace, outcome = {}) {
    if (!trace) return null;
    trace.endedAt = Date.now();
    trace.durationMs = trace.endedAt - trace.startedAt;
    trace.outcome = outcome;
    try {
      const day = new Date().toISOString().slice(0, 10);
      const file = path.join(this.dir, `${day}.jsonl`);
      fs.appendFileSync(file, JSON.stringify(trace) + '\n');
    } catch (_) {}
    return trace;
  }
}

class HealthWindow {
  constructor(maxSamples = 100) {
    this.samples = [];
    this.max = maxSamples;
  }

  record(latencyMs, ok = true) {
    this.samples.push({ latencyMs, ok, at: Date.now() });
    if (this.samples.length > this.max) this.samples.shift();
  }

  snapshot() {
    if (!this.samples.length) {
      return { count: 0, avgMs: null, p95Ms: null, errorRate: 0 };
    }
    const lat = this.samples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const errors = this.samples.filter((s) => !s.ok).length;
    const p95 = lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))];
    const avg = lat.reduce((a, b) => a + b, 0) / lat.length;
    return {
      count: this.samples.length,
      avgMs: Math.round(avg),
      p95Ms: p95,
      errorRate: errors / this.samples.length
    };
  }
}

class PromptCanary {
  hash(prompt) {
    return crypto.createHash('sha256').update(String(prompt || '')).digest('hex').slice(0, 16);
  }

  check(partnerId, prompt, expectedHash) {
    const actual = this.hash(prompt);
    return {
      partnerId,
      actual,
      expected: expectedHash || null,
      match: expectedHash ? expectedHash === actual : true,
      len: String(prompt || '').length
    };
  }
}

class ConversationFSM {
  constructor() {
    /** @type {Map<string, { state: string, updatedAt: number, payload: object }>} */
    this.map = new Map();
  }

  key(partnerId, remoteJid) {
    return `${partnerId || 'default'}|${remoteJid || 'unknown'}`;
  }

  get(partnerId, remoteJid) {
    const k = this.key(partnerId, remoteJid);
    const row = this.map.get(k);
    if (!row) return { state: 'INITIAL', payload: {} };
    return row;
  }

  transition(partnerId, remoteJid, intent, payloadPatch = {}) {
    const k = this.key(partnerId, remoteJid);
    const cur = this.map.get(k) || { state: 'INITIAL', payload: {}, updatedAt: Date.now() };
    const primary = String(intent || 'general').split('+')[0];
    const target = INTENT_TO_STATE[primary] || 'GENERAL';
    const allowed = PME_TRANSITIONS[cur.state] || PME_TRANSITIONS.GENERAL;
    let next = target;
    if (cur.state !== 'INITIAL' && !allowed.includes(target)) {
      // soft: still move if discovery graph allows GENERAL
      if (allowed.includes('GENERAL')) next = target === 'DONE' ? 'DONE' : target;
    }
    const row = {
      state: next,
      payload: { ...cur.payload, ...payloadPatch },
      updatedAt: Date.now(),
      prev: cur.state,
      intent: primary
    };
    this.map.set(k, row);
    return row;
  }

  confirmationScript(payload = {}) {
    const parts = [];
    if (payload.serviceName) parts.push(payload.serviceName);
    if (payload.dateStr) parts.push(payload.dateStr);
    if (payload.timeSlot) parts.push(payload.timeSlot);
    if (payload.clientName) parts.push(payload.clientName);
    if (payload.priceLabel) parts.push(payload.priceLabel);
    if (!parts.length) return null;
    return `CONFIRMAÇÃO SUGERIDA: ${parts.join(' · ')} — confirme com o cliente antes de createAppointment.`;
  }
}

class MaxRuntimeExcellence {
  constructor(options = {}) {
    ensureDir(ROOT);
    this.breaker = new ToolCircuitBreaker(options.breaker);
    this.limiter = new RateLimiter(options.limiter);
    this.idempotency = new BookingIdempotency(options.idempotency);
    this.replay = new ConversationReplay(options.replay);
    this.traces = new TraceLog(options.traces);
    this.health = new HealthWindow(100);
    this.canary = new PromptCanary();
    this.fsm = new ConversationFSM();
    /** priority: Set of VIP jids */
    this.vipJids = new Set(options.vipJids || []);
  }

  isVip(remoteJid) {
    return this.vipJids.has(String(remoteJid || ''));
  }

  /**
   * Gate de entrada do turno (rate limit + priority flag).
   */
  admit(partnerId, remoteJid) {
    const key = `${partnerId}|${remoteJid}`;
    const limit = this.limiter.allow(key);
    return {
      ...limit,
      priority: this.isVip(remoteJid) ? 'vip' : 'normal'
    };
  }

  wrapDispatch(dispatchFn) {
    const self = this;
    return async (name, args, partnerId) => {
      if (self.breaker.isOpen(name)) {
        return {
          ok: false,
          status: 'DEGRADED',
          tool: name,
          reason: 'CIRCUIT_OPEN',
          message: `Ferramenta ${name} temporariamente indisponível (circuit open).`
        };
      }
      try {
        const result = await dispatchFn(name, args, partnerId);
        const failed =
          result &&
          (result.ok === false || result.status === 'ERROR' || result.status === 'FAILED');
        if (failed) self.breaker.recordFailure(name);
        else self.breaker.recordSuccess(name);
        return result;
      } catch (err) {
        self.breaker.recordFailure(name);
        return { ok: false, status: 'ERROR', tool: name, reason: err.message };
      }
    };
  }
}

let _singleton = null;
function getRuntimeExcellence() {
  if (!_singleton) _singleton = new MaxRuntimeExcellence();
  return _singleton;
}

module.exports = {
  MaxRuntimeExcellence,
  getRuntimeExcellence,
  ToolCircuitBreaker,
  RateLimiter,
  BookingIdempotency,
  ConversationReplay,
  TraceLog,
  HealthWindow,
  PromptCanary,
  ConversationFSM,
  PME_TRANSITIONS,
  INTENT_TO_STATE
};
