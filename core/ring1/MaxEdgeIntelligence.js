'use strict';

/**
 * MaxEdgeIntelligence — R1.7 Edge Intelligence
 *
 * Módulos:
 *   RegionalNormalizer    — normaliza gírias/regionalismos PT-BR antes do classify
 *   AudioExecutiveSummary — resume transcrição longa (pós-STT, sem chamar LLM)
 *   OfflineFirstQueue     — fila JSONL local com aviso pré-programado (sem Redis)
 *   EthicalReactivation   — rastreia contatos silenciosos; candidatos opt-in + cooldown
 *
 * Single-process Node; persistência em workspace/edge_intelligence/.
 * UI intocada. STT (Groq/Gemini) intocado.
 */

const fs   = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '../../workspace/edge_intelligence');
const OFFLINE_DIR      = path.join(ROOT, 'offline_queue');
const REACTIVATION_DIR = path.join(ROOT, 'reactivation');

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
ensureDir(ROOT);
ensureDir(OFFLINE_DIR);
ensureDir(REACTIVATION_DIR);

// ─── REGIONAL_MAP ─────────────────────────────────────────────────────────────
const REGIONAL_MAP = [
  [/\buai\b/gi,                    ' '],
  [/\bsô\b/gi,                     ' '],
  [/\bmarca pra mim\b/gi,          'quero agendar'],
  [/\bmarca para mim\b/gi,         'quero agendar'],
  [/\bbota na agenda\b/gi,         'quero agendar'],
  [/\btem vaga\b/gi,               'quero agendar horário disponível'],
  [/\bencaixa eu\b/gi,             'quero agendar'],
  [/\bencaixa a?mi?m\b/gi,         'quero agendar'],
  [/\boxente\b/gi,                  ' '],
  [/\bvou marcar\b/gi,             'quero agendar'],
  [/\bbah\b/gi,                    ' '],
  [/\btri legal\b/gi,              ' '],
  [/\bpode ser\b/gi,               'sim'],
  [/\bfechou\b/gi,                 'sim'],
  [/\bvaleu\b/gi,                  'obrigado'],
  [/\bblz\b/gi,                    'ok'],
  [/\bbeleza\b/gi,                 'ok'],
  [/\bshow\b/gi,                   'ok'],
  [/\btop\b/gi,                    'ok'],
  [/\bquanto fica\b/gi,            'quanto custa'],
  [/\bquanto sai\b/gi,             'quanto custa'],
  [/\bcusta quanto\b/gi,           'quanto custa'],
  [/\btem horário\b/gi,            'horário disponível'],
  [/\btem hora\b/gi,               'horário disponível'],
  [/\bdesmarca\b/gi,               'cancelar'],
  [/\bremarca\b/gi,                'remarcar'],
  [/\bde manh[aã]zinha\b/gi,       'de manhã'],
  [/\bfinzinho de tarde\b/gi,      'final da tarde'],
];

// ─── BLOCO 1 — RegionalNormalizer ─────────────────────────────────────────────
class RegionalNormalizer {
  normalize(text) {
    const original = String(text || '');
    let result = original;
    const regionalHits = [];
    for (const [re, replacement] of REGIONAL_MAP) {
      if (re.test(result)) {
        regionalHits.push(re.source.slice(0, 40));
        result = result.replace(re, replacement);
      }
      re.lastIndex = 0; // reset stateful global regexes
    }
    result = result.replace(/\s+/g, ' ').trim();
    return { text: result, original, regionalHits };
  }
}

// ─── BLOCO 2 — AudioExecutiveSummary ─────────────────────────────────────────
const AUDIO_PREFIX_RE = /^\[ÁUDIO TRANSCRITO DO CLIENTE\][:]\s*/i;

const WEEKDAY_EN = { domingo:0, segunda:1, 'terça':2, terca:2, quarta:3, quinta:4, sexta:5, 'sábado':6, sabado:6 };

function _nextWeekday(targetDow) {
  const now = new Date();
  const diff = (targetDow - now.getDay() + 7) % 7 || 7;
  return new Date(now.getTime() + diff * 86400000).toISOString().slice(0, 10);
}

function _extractDate(t) {
  const today = new Date();
  if (/\bhoje\b/i.test(t))        return today.toISOString().slice(0, 10);
  if (/\bamanh[aã]\b/i.test(t))   return new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  const dmY = t.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmY) return `${dmY[3]}-${dmY[2].padStart(2,'0')}-${dmY[1].padStart(2,'0')}`;
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const dm = t.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (dm) return `${today.getFullYear()}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
  const wd = t.match(/\b(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:-feira)?\b/i);
  if (wd) {
    const key = wd[1].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const dow = WEEKDAY_EN[key];
    if (dow !== undefined) return _nextWeekday(dow);
  }
  return null;
}

function _extractTime(t) {
  const hm = t.match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (hm) return `${hm[1].padStart(2,'0')}:${hm[2]}`;
  const hOnly = t.match(/(\d{1,2})\s*h\b/i);
  if (hOnly) return `${hOnly[1].padStart(2,'0')}:00`;
  if (/\bmanh[aã]\b/i.test(t)) return '09:00';
  if (/\btarde\b/i.test(t))    return '14:00';
  if (/\bnoite\b/i.test(t))    return '18:00';
  return null;
}

function _extractName(t) {
  const m = t.match(/(?:meu nome [eé]|me chamo|sou (?:a|o)?)\s+([A-Za-zÀ-ú]{2,}(?:\s+[A-Za-zÀ-ú]{2,}){0,2})/i);
  return m ? m[1].trim() : null;
}

class AudioExecutiveSummary {
  constructor(regional) {
    this.regional = regional || new RegionalNormalizer();
  }

  summarize(transcript, catalogNames = []) {
    const raw = String(transcript || '');
    const stripped = raw.replace(AUDIO_PREFIX_RE, '').trim();
    const norm = this.regional.normalize(stripped);
    const t = norm.text.toLowerCase();

    let serviceName = null;
    if (Array.isArray(catalogNames) && catalogNames.length) {
      serviceName = catalogNames.find(n => t.includes(String(n).toLowerCase())) || null;
    }

    const dateStr    = _extractDate(t);
    const timeSlot   = _extractTime(t);
    const clientName = _extractName(norm.text);

    const wantsBook   = /\b(agendar|marcar|reservar|quero agendar|horário dispon)\b/i.test(norm.text);
    const wantsCancel = /\b(cancelar|desmarcar|desmarca)\b/i.test(norm.text);
    const wantsPrice  = /\b(quanto custa|pre[cç]o|valor|tabela)\b/i.test(norm.text);

    const parts = [
      serviceName ? `serviço: ${serviceName}` : null,
      dateStr     ? `dia ${dateStr}` : null,
      timeSlot    ? `às ${timeSlot}` : null,
      clientName  ? `nome: ${clientName}` : null,
    ].filter(Boolean);

    let oneLiner = '';
    if (parts.length >= 2) {
      oneLiner = `Entendi: você falou sobre ${parts.join(', ')}.`;
    } else if (wantsBook && !serviceName) {
      oneLiner = 'Entendi que você quer agendar. Qual serviço, dia e horário prefere?';
    } else {
      oneLiner = norm.text.slice(0, 180);
    }

    let actionPrompt = '';
    if (wantsBook || wantsCancel || wantsPrice) {
      const srv  = serviceName || '(serviço a confirmar)';
      const day  = dateStr     || '(data a confirmar)';
      const hr   = timeSlot    || '(horário a confirmar)';
      const nome = clientName  || '(nome a confirmar)';
      if (wantsBook) {
        actionPrompt = `Entendi, você quer marcar ${srv} para ${day} às ${hr} (${nome}). Está correto?`;
      } else if (wantsCancel) {
        actionPrompt = `Entendi, você quer cancelar ${srv} para ${day} às ${hr} (${nome}). Confirma?`;
      } else if (wantsPrice) {
        actionPrompt = `Você quer saber o preço de ${srv}. Posso ajudar!`;
      }
    }

    const executiveFact = `ÁUDIO_RESUMO_EXECUTIVO: ${oneLiner}${actionPrompt ? ` | AÇÃO: ${actionPrompt}` : ''}`;

    return { ok: true, originalLength: raw.length, normalized: norm.text,
      regionalHits: norm.regionalHits, serviceName, dateStr, timeSlot, clientName,
      oneLiner, actionPrompt, wantsBook, wantsCancel, wantsPrice, executiveFact };
  }
}

// ─── BLOCO 3 — OfflineFirstQueue ─────────────────────────────────────────────
const OFFLINE_SURVIVAL_MSG =
  'No momento nossa conexão está instável. Já anotei sua mensagem e a equipe retoma assim que o sinal estabilizar. Obrigado pela paciência.';

class OfflineFirstQueue {
  constructor(options = {}) {
    this.dir = options.dir || OFFLINE_DIR;
    this.noticeCooldownMs = options.noticeCooldownMs || 5 * 60 * 1000;
    this._lastNoticeAt = new Map();
    ensureDir(this.dir);
  }

  _filePath(partnerId) {
    const safe = String(partnerId || 'default').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);
    return path.join(this.dir, `${safe}.jsonl`);
  }

  enqueue({ partnerId, remoteJid, text, meta = {} }) {
    const id = crypto.randomBytes(3).toString('hex');
    const entry = {
      id, partnerId: partnerId || 'default', remoteJid: remoteJid || 'unknown',
      text: String(text || '').slice(0, 2000),
      meta: { offline: true, ...meta },
      at: new Date().toISOString(), processed: false
    };
    try {
      fs.appendFileSync(this._filePath(entry.partnerId), JSON.stringify(entry) + '\n', 'utf8');
    } catch (e) { console.warn('[OFFLINE_QUEUE] enqueue error:', e.message); }
    return id;
  }

  pending(partnerId) {
    try {
      return fs.readFileSync(this._filePath(partnerId), 'utf8')
        .split('\n').filter(Boolean)
        .map(l => { try { return JSON.parse(l); } catch (_) { return null; } })
        .filter(e => e && !e.processed);
    } catch (_) { return []; }
  }

  markProcessed(partnerId, id) {
    try {
      const fp = this._filePath(partnerId);
      const updated = fs.readFileSync(fp, 'utf8').split('\n').filter(Boolean).map(l => {
        try { const e = JSON.parse(l); if (e.id === id) { e.processed = true; return JSON.stringify(e); } return l; } catch (_) { return l; }
      });
      fs.writeFileSync(fp, updated.join('\n') + '\n', 'utf8');
    } catch (_) {}
  }

  survivalNotice(remoteJid) {
    const now = Date.now();
    if (now - (this._lastNoticeAt.get(remoteJid) || 0) < this.noticeCooldownMs) {
      return { send: false, message: null };
    }
    this._lastNoticeAt.set(remoteJid, now);
    return { send: true, message: OFFLINE_SURVIVAL_MSG };
  }
}

// ─── BLOCO 4 — EthicalReactivation ───────────────────────────────────────────
const REACTIVATION_TEMPLATE =
  'Olá{nome}! Faz um tempo que não falamos. Se quiser remarcar ou tirar uma dúvida, é só responder esta mensagem. Sem compromisso.';

class EthicalReactivation {
  constructor(options = {}) {
    this.dir = options.dir || REACTIVATION_DIR;
    this.defaultDays  = options.defaultDays  || 45;
    this.cooldownDays = options.cooldownDays || 90;
    ensureDir(this.dir);
  }

  _filePath(partnerId) {
    const safe = String(partnerId || 'default').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);
    return path.join(this.dir, `${safe}.json`);
  }

  _load(partnerId) {
    try {
      const fp = this._filePath(partnerId);
      if (!fs.existsSync(fp)) return { contacts: {} };
      return JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (_) { return { contacts: {} }; }
  }

  _save(partnerId, data) {
    try {
      const fp = this._filePath(partnerId);
      const tmp = fp + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, fp);
    } catch (_) {}
  }

  touch(partnerId, remoteJid, clientName) {
    const data = this._load(partnerId);
    data.contacts = data.contacts || {};
    const existing = data.contacts[remoteJid] || { optIn: true, lastReactivationAt: null };
    data.contacts[remoteJid] = { ...existing,
      lastSeen: new Date().toISOString(),
      clientName: clientName || existing.clientName || null,
      optIn: existing.optIn !== false
    };
    this._save(partnerId, data);
  }

  setOptIn(partnerId, remoteJid, optIn) {
    const data = this._load(partnerId);
    data.contacts = data.contacts || {};
    data.contacts[remoteJid] = { ...(data.contacts[remoteJid] || {}), optIn: Boolean(optIn) };
    this._save(partnerId, data);
  }

  candidates(partnerId, days) {
    const silenceDays = days || this.defaultDays;
    const data = this._load(partnerId);
    const now = Date.now();
    const silenceMs  = silenceDays * 86400000;
    const cooldownMs = this.cooldownDays * 86400000;
    return Object.entries(data.contacts || {}).filter(([, c]) => {
      if (!c.optIn || !c.lastSeen) return false;
      if (now - new Date(c.lastSeen).getTime() < silenceMs) return false;
      if (c.lastReactivationAt && now - new Date(c.lastReactivationAt).getTime() < cooldownMs) return false;
      return true;
    }).map(([remoteJid, c]) => ({
      remoteJid, clientName: c.clientName || null, lastSeen: c.lastSeen,
      message: REACTIVATION_TEMPLATE.replace('{nome}', c.clientName ? `, ${c.clientName}` : '')
    }));
  }

  markSent(partnerId, remoteJid) {
    const data = this._load(partnerId);
    if (data.contacts && data.contacts[remoteJid]) {
      data.contacts[remoteJid].lastReactivationAt = new Date().toISOString();
      this._save(partnerId, data);
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────
class MaxEdgeIntelligence {
  constructor(options = {}) {
    this.regional     = new RegionalNormalizer();
    this.audio        = new AudioExecutiveSummary(this.regional);
    this.offline      = new OfflineFirstQueue(options.offline || {});
    this.reactivation = new EthicalReactivation(options.reactivation || {});
  }
}

let _singleton = null;
function getEdgeIntelligence(options) {
  if (!_singleton) _singleton = new MaxEdgeIntelligence(options || {});
  return _singleton;
}

module.exports = {
  MaxEdgeIntelligence,
  getEdgeIntelligence,
  RegionalNormalizer,
  AudioExecutiveSummary,
  OfflineFirstQueue,
  EthicalReactivation,
  REGIONAL_MAP
};
