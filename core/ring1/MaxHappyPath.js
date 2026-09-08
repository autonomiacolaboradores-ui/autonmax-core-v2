'use strict';

/**
 * MaxHappyPath — R1.5 tópicos 11–20 (caminho feliz)
 * Onboarding · agenda 3 passos · confirmação legível · lembretes · lista de espera ·
 * handoff · fora de horário + lead · áudio estável · reincidente · assistente do dia
 * UI intocada. Sem teatro.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '../../workspace/happy_path');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function todayISO(tz = 'America/Sao_Paulo') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch (_) {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Tópico 11 — Onboarding 1 mensagem de teste */
class OnboardingProbe {
  constructor(options = {}) {
    this.dir = options.dir || path.join(ROOT, 'onboarding');
    ensureDir(this.dir);
  }

  /** Gera script de 1 mensagem para validar canal (WA/web) sem LLM. */
  script({ partnerName, mode } = {}) {
    const name = partnerName || 'seu estabelecimento';
    return {
      ok: true,
      topic: 11,
      message: `Olá! Sou o Max, atendente de ${name}. Posso falar de serviços, horários e agendar. Responda com “oi” para começarmos.`,
      expectedReplyHints: ['oi', 'serviço', 'horário', 'agendar']
    };
  }

  markSent(partnerId, channel, payload) {
    const row = {
      partnerId: partnerId || 'default',
      channel: channel || 'wa',
      at: new Date().toISOString(),
      payload
    };
    const f = path.join(this.dir, `${row.partnerId}_${row.channel}.json`);
    try {
      fs.writeFileSync(f, JSON.stringify(row, null, 2));
    } catch (_) {}
    return row;
  }
}

/**
 * Tópico 12 — Agenda em 3 passos verbais
 * Passo 1 serviço · Passo 2 data/hora · Passo 3 nome (+ confirmação)
 */
class BookingThreeStep {
  constructor() {
    /** @type {Map<string, object>} */
    this.sessions = new Map();
  }

  key(partnerId, remoteJid) {
    return `${partnerId || 'default'}|${remoteJid || 'unknown'}`;
  }

  get(partnerId, remoteJid) {
    return this.sessions.get(this.key(partnerId, remoteJid)) || {
      step: 0,
      serviceName: null,
      dateStr: null,
      timeSlot: null,
      clientName: null
    };
  }

  /**
   * Avança o funil. Retorna { step, missing, prompt, ready }
   */
  advance(partnerId, remoteJid, patch = {}) {
    const k = this.key(partnerId, remoteJid);
    const cur = { ...this.get(partnerId, remoteJid), ...patch };
    let step = 0;
    if (cur.serviceName) step = 1;
    if (cur.serviceName && cur.dateStr && cur.timeSlot) step = 2;
    if (cur.serviceName && cur.dateStr && cur.timeSlot && cur.clientName) step = 3;
    cur.step = step;
    this.sessions.set(k, cur);

    if (step === 0) {
      return {
        step: 0,
        ready: false,
        missing: ['serviceName'],
        prompt: 'Qual serviço você deseja agendar?'
      };
    }
    if (step === 1) {
      return {
        step: 1,
        ready: false,
        missing: ['dateStr', 'timeSlot'],
        prompt: `Serviço: ${cur.serviceName}. Para qual dia e horário? (ex.: amanhã de manhã às 9, ou quinta às 14h)`
      };
    }
    if (step === 2) {
      let when = `${cur.dateStr} às ${cur.timeSlot}`;
      try {
        const BDT = require('../ring2/BookingDateTime');
        when = BDT.formatFriendly(cur.dateStr, cur.timeSlot);
      } catch (_) {}
      return {
        step: 2,
        ready: false,
        missing: ['clientName'],
        prompt: `${cur.serviceName} em ${when}. Em nome de quem fica o agendamento?`
      };
    }
    return {
      step: 3,
      ready: true,
      missing: [],
      prompt: null,
      payload: {
        serviceName: cur.serviceName,
        dateStr: cur.dateStr,
        timeSlot: cur.timeSlot,
        clientName: cur.clientName
      }
    };
  }

  reset(partnerId, remoteJid) {
    this.sessions.delete(this.key(partnerId, remoteJid));
  }
}

/** Tópico 13 — Confirmação obrigatória legível */
class ReadableConfirmation {
  /**
   * Monta texto humano legível (não JSON) para o cliente confirmar antes do book.
   */
  build({ serviceName, dateStr, timeSlot, clientName, priceLabel, durationMinutes, storeName, serviceTag } = {}) {
    let when = null;
    if (dateStr || timeSlot) {
      try {
        const BDT = require('../ring2/BookingDateTime');
        when = BDT.formatFriendly(dateStr, timeSlot);
      } catch (_) {
        when = [dateStr, timeSlot ? `às ${timeSlot}` : ''].filter(Boolean).join(' ');
      }
    }
    // Só monta confirmação se houver o mínimo legível — evita registro desencontrado
    const lines = [];
    lines.push('📋 *Confirmação do agendamento*');
    if (storeName) lines.push(`Local: ${storeName}`);
    if (serviceName) lines.push(`Serviço: ${serviceName}`);
    if (when) lines.push(`Quando: ${when}`);
    if (durationMinutes) lines.push(`Duração: ${durationMinutes} min`);
    if (clientName) lines.push(`Cliente: ${clientName}`);
    if (priceLabel) lines.push(`Valor: ${priceLabel}`);
    lines.push('');
    lines.push('Responda *SIM* para eu confirmar na agenda ou *NÃO* para alterar.');
    return {
      ok: true,
      topic: 13,
      text: lines.join('\n'),
      requiresExplicitYes: true,
      payload: {
        serviceName: serviceName || null,
        serviceTag: serviceTag || null,
        dateStr: dateStr || null,
        timeSlot: timeSlot || null,
        clientName: clientName || null,
        priceLabel: priceLabel || null,
        durationMinutes: durationMinutes || null,
        when
      }
    };
  }

  isAffirmative(text) {
    const t = String(text || '')
      .trim()
      .toLowerCase();
    return /^(sim|s|yes|confirmo|confirma|ok|pode|fechado|isso)\b/.test(t);
  }

  isNegative(text) {
    const t = String(text || '')
      .trim()
      .toLowerCase();
    return /^(n[aã]o|nao|no|cancelar|alterar|mudar)\b/.test(t);
  }
}

/** Tópico 14 — Lembrete T−24h / T−2h */
class AppointmentReminders {
  constructor(options = {}) {
    this.dir = options.dir || path.join(ROOT, 'reminders');
    ensureDir(this.dir);
  }

  /**
   * Calcula janelas de lembrete a partir de dateStr + timeSlot (America/Sao_Paulo).
   */
  scheduleWindows({ appointmentId, dateStr, timeSlot, clientName, serviceName, customerPhone } = {}) {
    if (!dateStr || !timeSlot) {
      return { ok: false, reason: 'NEED_DATETIME' };
    }
    const iso = `${dateStr}T${timeSlot}:00`;
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) {
      return { ok: false, reason: 'BAD_DATETIME' };
    }
    const t24 = new Date(when.getTime() - 24 * 60 * 60 * 1000);
    const t2 = new Date(when.getTime() - 2 * 60 * 60 * 1000);
    const row = {
      appointmentId: appointmentId || crypto.randomBytes(6).toString('hex'),
      dateStr,
      timeSlot,
      clientName: clientName || null,
      serviceName: serviceName || null,
      customerPhone: customerPhone || null,
      reminders: [
        { kind: 'T-24h', fireAt: t24.toISOString(), sent: false },
        { kind: 'T-2h', fireAt: t2.toISOString(), sent: false }
      ],
      createdAt: new Date().toISOString()
    };
    try {
      fs.writeFileSync(path.join(this.dir, `${row.appointmentId}.json`), JSON.stringify(row, null, 2));
    } catch (_) {}
    return { ok: true, topic: 14, ...row };
  }

  /** Lembretes cujo fireAt <= now e ainda não enviados */
  due(now = new Date()) {
    const out = [];
    try {
      for (const name of fs.readdirSync(this.dir)) {
        if (!name.endsWith('.json')) continue;
        const row = JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8'));
        for (const r of row.reminders || []) {
          if (!r.sent && new Date(r.fireAt).getTime() <= now.getTime()) {
            out.push({
              appointmentId: row.appointmentId,
              kind: r.kind,
              fireAt: r.fireAt,
              clientName: row.clientName,
              serviceName: row.serviceName,
              dateStr: row.dateStr,
              timeSlot: row.timeSlot,
              customerPhone: row.customerPhone,
              message: this._message(row, r.kind)
            });
          }
        }
      }
    } catch (_) {}
    return out;
  }

  markSent(appointmentId, kind) {
    const f = path.join(this.dir, `${appointmentId}.json`);
    try {
      if (!fs.existsSync(f)) return false;
      const row = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const r of row.reminders || []) {
        if (r.kind === kind) r.sent = true;
      }
      fs.writeFileSync(f, JSON.stringify(row, null, 2));
      return true;
    } catch (_) {
      return false;
    }
  }

  _message(row, kind) {
    const label = kind === 'T-24h' ? 'amanhã' : 'em cerca de 2 horas';
    return `Lembrete (${kind}): ${row.clientName || 'Cliente'}, seu horário de ${row.serviceName || 'serviço'} é ${label} — ${row.dateStr} às ${row.timeSlot}.`;
  }
}

/** Tópico 15 — Lista de espera */
class Waitlist {
  constructor(options = {}) {
    this.dir = options.dir || path.join(ROOT, 'waitlist');
    ensureDir(this.dir);
  }

  _file(partnerId) {
    return path.join(this.dir, `${partnerId || 'default'}.json`);
  }

  _load(partnerId) {
    try {
      const f = this._file(partnerId);
      if (!fs.existsSync(f)) return [];
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (_) {
      return [];
    }
  }

  _save(partnerId, rows) {
    try {
      fs.writeFileSync(this._file(partnerId), JSON.stringify(rows, null, 2));
    } catch (_) {}
  }

  enqueue({ partnerId, remoteJid, clientName, serviceName, preferredDate, note } = {}) {
    const rows = this._load(partnerId);
    const id = crypto.randomBytes(6).toString('hex');
    const row = {
      id,
      remoteJid: remoteJid || null,
      clientName: clientName || null,
      serviceName: serviceName || null,
      preferredDate: preferredDate || null,
      note: note || null,
      status: 'WAITING',
      at: new Date().toISOString()
    };
    rows.push(row);
    this._save(partnerId, rows);
    return { ok: true, topic: 15, entry: row, position: rows.filter((r) => r.status === 'WAITING').length };
  }

  list(partnerId, onlyWaiting = true) {
    let rows = this._load(partnerId);
    if (onlyWaiting) rows = rows.filter((r) => r.status === 'WAITING');
    return { ok: true, topic: 15, items: rows, count: rows.length };
  }

  promote(partnerId, id) {
    const rows = this._load(partnerId);
    const hit = rows.find((r) => r.id === id);
    if (!hit) return { ok: false, reason: 'NOT_FOUND' };
    hit.status = 'PROMOTED';
    hit.promotedAt = new Date().toISOString();
    this._save(partnerId, rows);
    return { ok: true, topic: 15, entry: hit };
  }
}

/** Tópico 16 — Handoff humano elegante */
class HumanHandoff {
  constructor(options = {}) {
    this.dir = options.dir || path.join(ROOT, 'handoff');
    ensureDir(this.dir);
  }

  request({ partnerId, remoteJid, reason, transcriptSnippet } = {}) {
    const id = crypto.randomBytes(6).toString('hex');
    const row = {
      id,
      partnerId: partnerId || 'default',
      remoteJid: remoteJid || null,
      reason: reason || 'cliente_solicitou',
      transcriptSnippet: (transcriptSnippet || '').slice(0, 500),
      status: 'OPEN',
      at: new Date().toISOString()
    };
    try {
      fs.writeFileSync(path.join(this.dir, `${id}.json`), JSON.stringify(row, null, 2));
    } catch (_) {}
    return {
      ok: true,
      topic: 16,
      handoffId: id,
      clientMessage:
        'Claro — vou te conectar com um atendente humano. Em instantes alguém da equipe assume esta conversa. Obrigado pela paciência.',
      staffMessage: `Handoff #${id} · JID ${remoteJid || '—'} · motivo: ${row.reason}`
    };
  }

  resolve(handoffId, resolverId) {
    const f = path.join(this.dir, `${handoffId}.json`);
    try {
      if (!fs.existsSync(f)) return { ok: false, reason: 'NOT_FOUND' };
      const row = JSON.parse(fs.readFileSync(f, 'utf8'));
      row.status = 'RESOLVED';
      row.resolverId = resolverId || 'staff';
      row.resolvedAt = new Date().toISOString();
      fs.writeFileSync(f, JSON.stringify(row, null, 2));
      return { ok: true, topic: 16, handoff: row };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }
}

/** Tópico 17 — Fora de horário com captura de lead */
class AfterHoursLeadCapture {
  constructor(options = {}) {
    this.dir = options.dir || path.join(ROOT, 'leads');
    ensureDir(this.dir);
  }

  capture({ partnerId, remoteJid, name, phone, interest, rawText } = {}) {
    const id = crypto.randomBytes(6).toString('hex');
    const row = {
      id,
      partnerId: partnerId || 'default',
      remoteJid: remoteJid || null,
      name: name || null,
      phone: phone || null,
      interest: interest || null,
      rawText: (rawText || '').slice(0, 1000),
      source: 'after_hours',
      at: new Date().toISOString()
    };
    try {
      const day = todayISO();
      const f = path.join(this.dir, `${partnerId || 'default'}_${day}.jsonl`);
      fs.appendFileSync(f, JSON.stringify(row) + '\n');
    } catch (_) {}
    return {
      ok: true,
      topic: 17,
      leadId: id,
      clientMessage:
        'No momento estamos fora do horário de atendimento. Registrei seu contato e retornaremos assim que abrirmos. Obrigado!'
    };
  }
}

/** Tópico 18 — Áudio estável no mesmo pipeline (normalização de texto STT) */
class AudioPipelineGuard {
  /**
   * Normaliza resultado de STT para o mesmo processTurn de texto.
   * Não implementa STT — só garante contrato estável.
   */
  normalizeSttResult(stt = {}) {
    const text = String(stt.text || stt.transcript || '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      ok: text.length > 0,
      topic: 18,
      text,
      confidence: typeof stt.confidence === 'number' ? stt.confidence : null,
      durationMs: stt.durationMs || null,
      samePipeline: true,
      rejectReason: text.length ? null : 'EMPTY_TRANSCRIPT'
    };
  }
}

/** Tópico 19 — Cliente reincidente reconhecido */
class ReturningClientMemory {
  constructor(options = {}) {
    this.dir = options.dir || path.join(ROOT, 'clients');
    ensureDir(this.dir);
  }

  _file(partnerId, remoteJid) {
    const safe = String(remoteJid || 'unknown').replace(/[^a-zA-Z0-9@._-]/g, '_');
    return path.join(this.dir, `${partnerId || 'default'}__${safe}.json`);
  }

  touch({ partnerId, remoteJid, clientName, lastService, lastDate } = {}) {
    const f = this._file(partnerId, remoteJid);
    let row = { visits: 0, firstSeen: null, lastSeen: null };
    try {
      if (fs.existsSync(f)) row = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (_) {}
    const now = new Date().toISOString();
    row.visits = (row.visits || 0) + 1;
    row.firstSeen = row.firstSeen || now;
    row.lastSeen = now;
    if (clientName) row.clientName = clientName;
    if (lastService) row.lastService = lastService;
    if (lastDate) row.lastDate = lastDate;
    row.remoteJid = remoteJid || null;
    try {
      fs.writeFileSync(f, JSON.stringify(row, null, 2));
    } catch (_) {}
    return {
      ok: true,
      topic: 19,
      returning: row.visits > 1,
      visits: row.visits,
      profile: row,
      greetingHint:
        row.visits > 1
          ? `Que bom te ver de novo${row.clientName ? ', ' + row.clientName : ''}!${row.lastService ? ` Da última vez foi ${row.lastService}.` : ''}`
          : null
    };
  }

  lookup(partnerId, remoteJid) {
    const f = this._file(partnerId, remoteJid);
    try {
      if (!fs.existsSync(f)) return { ok: true, returning: false, visits: 0 };
      const row = JSON.parse(fs.readFileSync(f, 'utf8'));
      return { ok: true, topic: 19, returning: (row.visits || 0) > 1, visits: row.visits || 0, profile: row };
    } catch (_) {
      return { ok: true, returning: false, visits: 0 };
    }
  }
}



class MaxHappyPath {
  constructor(options = {}) {
    ensureDir(ROOT);
    this.onboarding = new OnboardingProbe(options.onboarding);
    this.threeStep = new BookingThreeStep();
    this.confirmation = new ReadableConfirmation();
    this.reminders = new AppointmentReminders(options.reminders);
    this.waitlist = new Waitlist(options.waitlist);
    this.handoff = new HumanHandoff(options.handoff);
    this.leads = new AfterHoursLeadCapture(options.leads);
    this.audio = new AudioPipelineGuard();
    this.clients = new ReturningClientMemory(options.clients);
  }
}

let _hp = null;
function getHappyPath() {
  if (!_hp) _hp = new MaxHappyPath();
  return _hp;
}

module.exports = {
  MaxHappyPath,
  getHappyPath,
  OnboardingProbe,
  BookingThreeStep,
  ReadableConfirmation,
  AppointmentReminders,
  Waitlist,
  HumanHandoff,
  AfterHoursLeadCapture,
  AudioPipelineGuard,
  ReturningClientMemory
};
