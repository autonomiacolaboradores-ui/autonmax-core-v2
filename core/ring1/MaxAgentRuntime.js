'use strict';

/**
 * MaxAgentRuntime — superpoderes (PME)
 *
 * Ideia fora da caixa: NÃO depender só do LLM descobrir tools.
 * 1) Classifica intenção com regras + palavras-chave (PT-BR)
 * 2) Executa tools determinísticas (preço, slot, clima, câmbio, wiki…)
 * 3) Passa FACTS ao LLM só para redigir resposta natural
 *
 * Assim o MAX "sabe" catálogo/agenda/clima mesmo se o modelo falhar em tool-calling.
 *
 * G1/G5 (fix): Micro-FSM de confirmação de booking em memória.
 *   - Ao detectar serviço+data+hora+nome na conversa, salva draft _bookingDraft.
 *   - No PRÓXIMO turn, ANTES de classificar intent, verifica confirmação ("sim").
 *   - Se confirmado → chama book_appointment_confirmed (R1.6: lembretes + idempotência).
 *   - Tenta calendar_create se token OAuth disponível; senão fato NEED_OAUTH honesto.
 * G4 (fix): Intent 'cancel' agora chama cancel_appointment.
 */

const GeminiToolsDispatcher = require('../ring2/GeminiToolsDispatcher');
const { PmeAgentConfigurator } = require('./PmeAgentConfigurator');
const { runWithContext, getContext } = require('./requestContext');
const fs = require('node:fs');
const path = require('node:path');
// Edge Intelligence (R1.7): regional normalizer + audio executive summary + offline + reactivation
let _getEdgeIntelligence = null;
try { ({ getEdgeIntelligence: _getEdgeIntelligence } = require('./MaxEdgeIntelligence')); } catch (_) {}

const MEMORY_ROOT = path.join(__dirname, '../../workspace/agent_memory');
const { getRuntimeExcellence } = require('./MaxRuntimeExcellence');
let _getMetricsLog = null;
try { ({ getMetricsLog: _getMetricsLog } = require('./MetricsEventLog')); } catch (_) {}

/** TTL do draft de booking em memória (30 minutos) */
const BOOKING_DRAFT_TTL_MS = 30 * 60 * 1000;

function _metric(type, partnerId, meta) {
  try {
    if (_getMetricsLog) _getMetricsLog().record({ type, partnerId, meta: meta || {} });
  } catch (_) {}
}

/**
 * Map em processo: `partnerId|userKey` → { serviceName, dateStr, timeSlot, clientName, expiresAt }
 * Persiste entre turnos da mesma conversa enquanto o processo estiver rodando.
 * Limitação documentada: não sobrevive a múltiplas réplicas (evoluir para SQLite booking_drafts).
 */
const _bookingDraft = new Map();
const _orderDraft = new Map();

const DRAFT_DISK_PATH = path.join(__dirname, '../../workspace/booking_drafts.json');
const _turnLocks = new Map();

function _loadDraftsFromDisk() {
  try {
    if (fs.existsSync(DRAFT_DISK_PATH)) {
      const data = JSON.parse(fs.readFileSync(DRAFT_DISK_PATH, 'utf-8'));
      const now = Date.now();
      for (const key in data) {
        if (data[key].expiresAt > now) {
          _bookingDraft.set(key, data[key]);
        }
      }
    }
  } catch (e) {
    console.warn('Falha ao carregar drafts do disco:', e.message);
  }
}

function _persistDraftsToDisk() {
  try {
    const obj = {};
    const now = Date.now();
    for (const [k, v] of _bookingDraft.entries()) {
      if (v.expiresAt < now) { _bookingDraft.delete(k); } else { obj[k] = v; }
    }
    // We only save _bookingDraft to the JSON to avoid mixing order Drafts in the same JSON. 
    // If needed we can save _orderDraft to another file, but for now memory is fine.
    for (const [k, v] of _orderDraft.entries()) {
      if (v.expiresAt < now) _orderDraft.delete(k);
    }
    const tmp = `${DRAFT_DISK_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
    fs.renameSync(tmp, DRAFT_DISK_PATH);
  } catch (e) {
    console.warn('Falha ao persistir drafts no disco:', e.message);
  }
}

_loadDraftsFromDisk();

async function withTurnLock(key, fn) {
  const currentLock = _turnLocks.get(key) || Promise.resolve();
  const nextLock = currentLock.then(async () => {
    try { return await fn(); } catch (e) { throw e; }
  }).catch((e) => { throw e; });
  _turnLocks.set(key, nextLock);
  return await nextLock;
}

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function normalizeTime(t) {
  const s = String(t || '').trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s || '09:00:00';
}

class MaxAgentRuntime {
  constructor(options = {}) {
    this.dispatcher = options.dispatcher || GeminiToolsDispatcher;
    this.pme = options.pmeConfigurator || new PmeAgentConfigurator();
    this.authManager = options.authManager || null;
    this.memoryRoot = options.memoryRoot || MEMORY_ROOT;
    this.excellence = options.excellence || getRuntimeExcellence();
    // Edge Intelligence singleton (R1.7)
    this.edge = options.edge || (_getEdgeIntelligence ? _getEdgeIntelligence() : null);
    ensureDir(this.memoryRoot);
  }


  // ─── Intenções PME ───────────────────────────────────────────────
  classifyPme(text) {
    const t = String(text || '').toLowerCase();
    if (/\b(pre[cç]o|valor|quanto custa|tabela|or[cç]amento|r\$)\b/.test(t)) return 'pricing';
    if (/\b(agendar|marcar|hor[aá]rio dispon|vaga|reservar|quando posso)\b/.test(t)) return 'booking';
    if (/\b(cancelar|desmarcar)\b/.test(t)) return 'cancel';
    if (/\b(hor[aá]rio de funcionamento|que horas|funcionamento|que hora (abre|fecha)|voc[eê]s? abrem|voc[eê]s? fecham)\b/.test(t)) return 'hours';
    if (/\b(pol[ií]tica|cancelamento|pagamento|forma de pagamento)\b/.test(t)) return 'policies';
    if (/\b(servi[cç]os?|o que (voc[eê]s?|vc) (faz|oferece)|cat[aá]logo|card[aá]pio)\b/.test(t)) return 'catalog';
    if (/\b(onde (fica|voc[eê]s? (ficam|s[aã]o))|endere[cç]o|como chegar)\b/.test(t)) return 'location';
    if (/\b(demora|quanto tempo|dura[cç][aã]o)\b/.test(t)) return 'duration';
    if (/\b(obrigad|valeu|thanks)\b/.test(t)) return 'thanks';
    if (/^(oi|ol[aá]|bom dia|boa tarde|boa noite)\b/.test(t.trim())) return 'greeting';
    return 'general';
  }


  async _dispatch(name, args, partnerId) {
    if (['calendar_list', 'calendar_create', 'calendar_update', 'calendar_cancel'].includes(name)) {
      if (process.env.DISABLE_GOOGLE_AUTH === 'true') {
        return { ok: false, reason: 'GOOGLE_AUTH_DISABLED' };
      }
      
      const GoogleCalendarConnector = require('../ring2/GoogleCalendarConnector');
      const isDev = process.env.NODE_ENV !== 'production';
      const ctx = getContext();
      const token =
        (args && (args.accessToken || args.token)) ||
        ctx.googleAccessToken ||
        (isDev ? process.env.GOOGLE_ACCESS_TOKEN : null) ||
        null;
      if (!token) {
        console.warn(`[CALENDAR] dispatch_no_token partner=${partnerId} tool=${name}`);
      }
      const map = {
        calendar_list: 'LIST',
        calendar_create: 'CREATE',
        calendar_update: 'UPDATE',
        calendar_cancel: 'CANCEL'
      };
      return GoogleCalendarConnector.dispatch(map[name], token, args || {});
    }
    if (name === 'book_appointment_confirmed') {
      const MaxNativeTools = require('../ring2/MaxNativeTools');
      return MaxNativeTools.dispatch('book_appointment_confirmed', { ...(args || {}), partnerId });
    }
    const run = async (n, a, pid) => {
      try {
        return await this.dispatcher.dispatch(n, a || {}, { partnerId: pid });
      } catch (err) {
        return { ok: false, status: 'ERROR', reason: err.message, tool: n };
      }
    };
    if (this.excellence && typeof this.excellence.wrapDispatch === 'function') {
      return this.excellence.wrapDispatch(run)(name, args, partnerId);
    }
    return run(name, args, partnerId);
  }

  _getPartnerCatalog(partnerId) {
    try {
      const sqlitePath = path.join(__dirname, '../../workspace/autonmax.db');
      if (fs.existsSync(sqlitePath)) {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(sqlitePath, { open: true });
        const row = db.prepare('SELECT business_rules FROM pme_configs_v2 WHERE partner_id = ?').get(partnerId);
        db.close();
        if (row && row.business_rules) {
          const br = typeof row.business_rules === 'string' ? JSON.parse(row.business_rules) : row.business_rules;
          if (br && br.catalog && typeof br.catalog === 'string' && br.catalog.trim().length > 0) {
              if (m && m[1].trim().length >= 3) {
                parsed.push({ name: m[1].trim() });
              }
            }
            if (parsed.length > 0) return parsed;
          }
        }
      }
    } catch (_) {}

    try {
      const cfg = this.pme.getAttendantConfig(partnerId);
      if (cfg && Array.isArray(cfg.catalog) && cfg.catalog.length > 0) {
        return cfg.catalog;
      }
    } catch (_) {}

    return [];
  }

  _serviceCatalogHint(partnerId) {
    try {
      const catalog = this._getPartnerCatalog(partnerId);
      const names = catalog.slice(0, 8).map((s) => s.name).filter(Boolean);
      return names.length ? ` Serviços disponíveis: ${names.join(', ')}.` : '';
    } catch (_) {
      return '';
    }
  }

  /**
   * Extrai nome de serviço do catálogo PME configurado a partir do texto.
   * Não inventa serviços genéricos; busca única e exclusivamente no catálogo real do parceiro.
   */
  extractServiceName(text, partnerId) {
    try {
      const catalog = this._getPartnerCatalog(partnerId);
      const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const t = norm(text);
      if (!t || catalog.length === 0) return null;

      // 1. Match exato por substring
      const exact = catalog.find((s) => t.includes(norm(s.name)));
      if (exact) return exact.name;

      // 2. Fuzzy: sobreposição de tokens com os serviços reais do parceiro
      const textTokens = new Set(t.split(/\s+/).filter((w) => w.length >= 3));
      let best = null;
      let bestScore = 0;
      for (const s of catalog) {
        const nameTokens = norm(s.name).split(/\s+/).filter((w) => w.length >= 3);
        if (nameTokens.length === 0) continue;
        const matched = nameTokens.filter((w) => textTokens.has(w)).length;
        const score = matched / nameTokens.length;
        if (score > bestScore) {
          bestScore = score;
          best = s;
        }
      }
      if (best && bestScore >= 0.5) return best.name;

      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Extrai data (YYYY-MM-DD) e horário (HH:MM) da mensagem.
   * Timezone America/Sao_Paulo · fala natural: amanhã, de manhã às 9, terça, etc.
   */
  extractDateTimeFromText(text) {
    try {
      const BDT = require('../ring2/BookingDateTime');
      const { dateStr, timeSlot, today, todayFriendly } = BDT.extractDateTime(text);
      return { dateStr, timeSlot, today, todayFriendly };
    } catch (_) {
      // Fallback mínimo se módulo indisponível
      const t = String(text || '').toLowerCase();
      let dateStr = null;
      let timeSlot = null;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      if (/amanh[aã]/i.test(t)) {
        const d = new Date(now.getTime() + 86400000);
        dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      } else if (/\bhoje\b/i.test(t)) dateStr = local;
      const tm = t.match(/\b(\d{1,2})(?::(\d{2}))?\b/);
      if (tm) timeSlot = `${pad(parseInt(tm[1], 10))}:${tm[2] || '00'}`;
      return { dateStr, timeSlot, today: local };
    }
  }

  /**
   * Detecta confirmação positiva do cliente (G5 fix).
   * Deve rodar ANTES de classifyPmeMulti para capturar "sim" isolado.
   */
  _detectConfirmation(text) {
    let t = String(text || '');
    t = t.replace(/\[ÁUDIO TRANSCRITO DO CLIENTE\]:\s*/i, '').trim().toLowerCase();
    if (/\b(n[aã]o|cancel|desistir|esquece|outro dia)\b/i.test(t) && !/\b(sim|confirma|pode)\b/i.test(t)) {
      return false;
    }
    const confirmPatterns = [
      /\b(sim|pode|ok|s|isso|exato|confirma|confirmar|confirmado|confirmo|ótimo|otimo|combinado|fechar|fecha|pode ser|tá|ta bom|tá bom|quero sim|perfeito|certo|correto|manda|vai|beleza|marca|marcar|agende|agendar)\b/i,
      /\b(pode (confirmar|agendar|marcar|fechar))\b/i,
      /\b(est[aá] (certo|correto|ótimo|ok))\b/i
    ];
    return confirmPatterns.some(p => p.test(t));
  }

  _draftKey(partnerId, userKey) {
    return `${String(partnerId || 'default')}|${String(userKey || 'anon')}`;
  }

  _saveDraft(partnerId, userKey, data) {
    const key = this._draftKey(partnerId, userKey);
    const prev = _bookingDraft.get(key);
    const wasEmpty = !prev || (!prev.serviceName && !prev.dateStr && !prev.timeSlot);
    const row = { ...data, expiresAt: Date.now() + BOOKING_DRAFT_TTL_MS };
    _bookingDraft.set(key, row);
    _persistDraftsToDisk();
    if (wasEmpty && (row.serviceName || row.dateStr || row.timeSlot)) {
      _metric('booking_started', partnerId, {
        serviceName: row.serviceName || null,
        dateStr: row.dateStr || null,
        timeSlot: row.timeSlot || null
      });
    }
  }

  /**
   * Próxima pergunta única do funil (elite: 1 pergunta por vez).
   */
  _nextBookingQuestion(draft) {
    const d = draft || {};
    if (!d.serviceName) {
      return 'Qual serviço você deseja agendar?';
    }
    if (!d.dateStr || !d.timeSlot) {
      return `Para o serviço *${d.serviceName}*, qual dia e horário prefere? (ex.: amanhã de manhã às 9)`;
    }
    if (!d.clientName) {
      let when = `${d.dateStr} às ${d.timeSlot}`;
      try {
        const BDT = require('../ring2/BookingDateTime');
        when = BDT.formatFriendly(d.dateStr, d.timeSlot);
      } catch (_) {}
      return `*${d.serviceName}* em ${when}. Em nome de quem fica o agendamento?`;
    }
    return null;
  }

  _readDraft(partnerId, userKey) {
    const key = this._draftKey(partnerId, userKey);
    let d = _bookingDraft.get(key);
    if (!d) {
      _loadDraftsFromDisk();
      d = _bookingDraft.get(key);
      if (!d) return null;
    }
    if (Date.now() > d.expiresAt) { 
      _bookingDraft.delete(key); 
      _persistDraftsToDisk();
      return null; 
    }
    return d;
  }

  _clearDraft(partnerId, userKey) {
    _bookingDraft.delete(this._draftKey(partnerId, userKey));
    _persistDraftsToDisk();
  }

  _saveOrderDraft(partnerId, userKey, data) {
    const key = this._draftKey(partnerId, userKey);
    const row = {
      ...data,
      expiresAt: Date.now() + BOOKING_DRAFT_TTL_MS
    };
    _orderDraft.set(key, row);
    _persistDraftsToDisk();
  }

  _readOrderDraft(partnerId, userKey) {
    const key = this._draftKey(partnerId, userKey);
    let d = _orderDraft.get(key);
    if (!d) return null;
    if (Date.now() > d.expiresAt) {
      _orderDraft.delete(key);
      _persistDraftsToDisk();
      return null;
    }
    return d;
  }

  _clearOrderDraft(partnerId, userKey) {
    _orderDraft.delete(this._draftKey(partnerId, userKey));
    _persistDraftsToDisk();
  }

  extractClientName(text, { requireExplicitIntro = false } = {}) {
    let t = String(text || '').replace(/\[ÁUDIO TRANSCRITO DO CLIENTE\]:\s*/i, '').trim();
    if (!t) return null;

    const SERVICE_LEADING_WORDS = /^(corte|barba|manicure|pedicure|escova|hidrata[cç][aã]o|consulta|atendimento|sobrancelha|depila[cç][aã]o|massagem|limpeza|tintura|colora[cç][aã]o|unha|cabelo|servi[cç]o|procedimento|sess[aã]o)\b/iu;

    // 1. Remove menções explícitas de data e hora do texto usando boundaries unicode
    let residual = t
      .replace(/(?:^|\P{L})(?:para|pra|pro|em|de|no|na)\s+(?:amanh[aã]|hoje|ontem)(?:\P{L}|$)/giu, ' ')
      .replace(/(?:^|\P{L})(?:amanh[aã]|hoje|ontem)(?:\P{L}|$)/giu, ' ')
      .replace(/(?:^|\P{L})(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:-feira)?(?:\P{L}|$)/giu, ' ')
      .replace(/(?:^|\P{L})(?:[aà]s\s+)?\d{1,2}(?::\d{2}|h\d{0,2})?\s*(?:da\s+(?:manh[aã]|tarde|noite)|horas?)?(?:\P{L}|$)/giu, ' ')
      .replace(/(?:^|\P{L})de\s+(?:manh[aã]|tarde|noite)(?:\P{L}|$)/giu, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!residual) return null;

    // 2. Procura introdução formal de nome no residual
    const introMatch = residual.match(
      /(?:meu nome [eé]|me chamo|sou (?:a|o)?|nome[:\s]+|em nome de |aqui [eé] (?:o|a)?|(?:marcar|agendar|pode ser|agendamento)?\s*(?:para (?:o|a)?|pro |pra ))\s*([A-Za-zÀ-ú]{2,}(?:\s+[A-Za-zÀ-ú]{2,}){0,2})/iu
    );

    let candidate = null;
    if (introMatch) {
      candidate = introMatch[1].trim();
    } else if (!requireExplicitIntro) {
      // Fallback de baixa confiança — só usado quando NÃO exigimos introdução explícita
      // (quando ainda não temos nenhum nome no draft).
      const leadingMatch = residual.match(/^([A-Za-zÀ-ú]{2,}(?:\s+[A-Za-zÀ-ú]{2,}){0,2})(?:[\s,]+|$)/iu);
      if (leadingMatch) {
        candidate = leadingMatch[1].trim();
      }
    }

    if (candidate) {
      candidate = candidate.replace(/\s+(?:vamos|quero|pode|por|favor|fechar|agendar|marcar|ok|sim)$/iu, '').trim();

      if (SERVICE_LEADING_WORDS.test(candidate)) {
        return null;
      }

      const nonNames = /^(sim|n[aã]o|ok|quero|pode|vamos|por favor|agendar|marcar|corte|barba|servi[cç]o|atendimento|obrigad[oa]|ol[aá]|bom dia|boa tarde|boa noite|consulta|hor[aá]rio|dia|tarde|manh[aã]|noite|[aà]s|horas?|pode confirmar|pode agendar|pode marcar|pode ser|t[aá] bom|est[aá] certo|est[aá] ok|confirma|confirmado|qual|quais)$/iu;
      if (this._detectConfirmation(candidate) && !introMatch) {
        return null;
      }
      if (!nonNames.test(candidate) && candidate.length >= 2) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Executa superpoderes PME e devolve facts + optional direct reply.
   */
  async runPmeActions(partnerId, userMessage, pushName, userKey) {
    const intent = this.classifyPme(userMessage);
    const facts = [];
    let toolResults = [];

    if (intent === 'pricing' || intent === 'catalog') {
      const r = await this._dispatch('list_services', { partnerId }, partnerId);
      toolResults.push(r);
      if (r && r.ok && r.services) {
        facts.push(
          'CATÁLOGO REAL:\n' +
            r.services
              .map((s) => `- ${s.name}: ${s.priceLabel} (${s.durationMinutes} min)`)
              .join('\n')
        );
      }
    }

    if (intent === 'hours') {
      const r = await this._dispatch('get_business_hours', { partnerId }, partnerId);
      toolResults.push(r);
      if (r && r.message) facts.push('HORÁRIO: ' + r.message);
    }

    if (intent === 'policies') {
      const r = await this._dispatch('get_store_policies', { partnerId }, partnerId);
      toolResults.push(r);
      if (r && r.policies) facts.push('POLÍTICAS: ' + JSON.stringify(r.policies));
    }

    if (intent === 'booking') {
      let todayStr;
      let todayLabel;
      try {
        const BDT = require('../ring2/BookingDateTime');
        const info = BDT.todayInfo();
        todayStr = info.dateStr;
        todayLabel = info.label;
      } catch (_) {
        const n = new Date();
        const pad = (x) => String(x).padStart(2, '0');
        todayStr = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
        todayLabel = `hoje (${todayStr})`;
      }
      const { dateStr: extractedDate, timeSlot: extractedSlot } = this.extractDateTimeFromText(userMessage);
      const day = extractedDate || todayStr;
      const draftService = this.extractServiceName(userMessage, partnerId);
      const slots = await this._dispatch(
        'get_next_available_slot',
        { partnerId, dateStr: day, serviceName: draftService || undefined },
        partnerId
      );
      toolResults.push(slots);
      facts.push(`HOJE É: ${todayLabel}. Use isso para interpretar "amanhã", "terça", etc.`);
      if (slots && slots.ok && slots.next) {
        const when =
          slots.dateFriendly
            ? `${slots.dateFriendly} às ${slots.next.timeSlot}`
            : `${slots.dateStr || day} às ${slots.next.timeSlot}`;
        facts.push(
          `PRÓXIMO HORÁRIO LIVRE: ${when} (${slots.durationMinutes || 30} min). Total livres neste dia: ${slots.totalFree || 1}.`
        );
      } else {
        facts.push(`Sem horários livres em ${day}. Ofereça outro dia/horário; não diga que a equipe humana vai confirmar.`);
      }
      const services = await this._dispatch('list_services', { partnerId }, partnerId);
      if (services && services.ok) {
        facts.push(
          'CATÁLOGO (use nomes EXATOS e tags internas): ' +
            (services.services || [])
              .map((s) => `${s.name}${s.priceLabel ? ' (' + s.priceLabel + ')' : ''}`)
              .join('; ')
        );
      }

      const extractedClientName = this.extractClientName(userMessage);
      const cleanPushName = (typeof pushName === 'string' && pushName.trim().length >= 2) ? pushName.trim() : null;
      const draftClientName = extractedClientName || cleanPushName;
      const draftTimeSlot = extractedSlot || (slots && slots.ok && slots.next && slots.next.timeSlot) || null;

      // Hard fail / catalog_miss se o cliente citou serviço fora do painel
      if (draftService) {
        try {
          const PmeBookingTools = require('../ring2/PmeBookingTools');
          const cat = (this.pme && this.pme.getAttendantConfig(partnerId).catalog) || [];
          if (cat.length > 0) {
            const hit = PmeBookingTools.resolveService(cat, draftService, null);
            if (!hit) {
              _metric('catalog_miss', partnerId, { serviceName: draftService });
              facts.push(
                `CATÁLOGO: "${draftService}" não encontrado. Liste os serviços reais e pergunte qual o cliente quer — UMA pergunta.`
              );
            }
          }
        } catch (_) {}
      }

      facts.__bookingDraftSeed = {
        clientName: draftClientName || '',
        contactPhone: userKey ? String(userKey).split('@')[0] : '',
        serviceName: draftService || '',
        dateStr: day,
        timeSlot: draftTimeSlot || ''
      };

      // Funil: uma pergunta por vez com base no que já temos
      const partial = {
        clientName: draftClientName || '',
        serviceName: draftService || '',
        dateStr: extractedDate || '',
        timeSlot: extractedSlot || ''
      };
      const nextQ = this._nextBookingQuestion(partial);
      if (nextQ) {
        facts.push(`PRÓXIMA PERGUNTA (só esta): ${nextQ}`);
      } else if (slots && slots.ok && slots.next && !extractedSlot) {
        // Cliente só disse "quero agendar" → oferecer próximo livre
        const when =
          slots.dateFriendly
            ? `${slots.dateFriendly} às ${slots.next.timeSlot}`
            : `${slots.dateStr || day} às ${slots.next.timeSlot}`;
        facts.push(
          `OBRIGATÓRIO: O cliente não escolheu horário. Você DEVE oferecer EXATAMENTE o próximo horário livre: ${when}. Pergunte se ele quer agendar para esse horário.`
        );
      }

      facts.push(
        'REGRA DE AGENDA: você (Max) confirma sozinho. NUNCA diga que a equipe humana vai confirmar. UMA pergunta por vez. Data legível (ex.: terça-feira, 2 de setembro de 2026 às 09:00). No SIM final, book_appointment_confirmed com confirmed=true.'
      );
      facts.push('Tom: curto, WhatsApp, máximo 2–3 frases. Sem jargão técnico.');
    }

    if (intent === 'greeting') {
      const profile = await this._dispatch('get_store_profile', { partnerId }, partnerId);
      toolResults.push(profile);
      if (profile && profile.profile) {
        facts.push(
          `Loja: ${profile.profile.storeName || profile.profile.displayName || 'estabelecimento'}`
        );
      }
    }

    if (intent === 'location') {
      const profile = await this._dispatch('get_store_profile', { partnerId }, partnerId);
      toolResults.push(profile);
      if (profile && profile.profile) {
        facts.push(
          `Perfil loja: ${profile.profile.storeName || profile.profile.displayName || 'N/D'} · segmento: ${profile.profile.storeSegment || 'N/D'}`
        );
      }
      facts.push(
        'Se o endereço completo não estiver na base, diga que o estabelecimento pode confirmar o endereço no perfil/Google — não invente rua.'
      );
    }

    if (intent === 'duration') {
      const names = [];
      const cfg = this.pme.getAttendantConfig(partnerId);
      for (const s of cfg.catalog || []) {
        if (String(userMessage).toLowerCase().includes(String(s.name).toLowerCase())) {
          names.push(s.name);
        }
      }
      const r = await this._dispatch(
        'estimate_visit_duration',
        { partnerId, serviceNames: names.length ? names : (cfg.catalog || []).slice(0, 1).map((s) => s.name) },
        partnerId
      );
      toolResults.push(r);
      if (r && r.ok) {
        facts.push(`DURAÇÃO ESTIMADA: ${r.totalMinutes} min · ${JSON.stringify(r.breakdown || [])}`);
      }
    }

    if (intent === 'thanks') {
      facts.push('Cliente agradeceu — responda curto e cordial; ofereça ajuda se precisar de mais alguma coisa.');
    }

    // G4 fix: intent cancel → chamar cancel_appointment de verdade
    if (intent === 'cancel') {
      const cancelName = this.extractClientName(userMessage);
      const { dateStr: cancelDate, timeSlot: cancelSlot } = this.extractDateTimeFromText(userMessage);
      const cancelArgs = {
        partnerId,
        ...(cancelName ? { clientName: cancelName } : {}),
        ...(cancelDate ? { dateStr: cancelDate } : {}),
        ...(cancelSlot ? { timeSlot: cancelSlot } : {})
      };
      const cancelResult = await this._dispatch('cancel_appointment', cancelArgs, partnerId);
      toolResults.push(cancelResult);
      if (cancelResult && cancelResult.ok) {
        facts.push(`CANCELAMENTO EXECUTADO ✅: ${cancelResult.message || 'Agendamento removido com sucesso.'}`);
        console.log(`[CANCEL_COMMIT] cancel_appointment → ok | partner=${partnerId} nome=${cancelName || '?'} data=${cancelDate || '?'} slot=${cancelSlot || '?'}`);
      } else {
        facts.push(
          `CANCELAMENTO: ${(cancelResult && cancelResult.message) || 'Não localizei agendamento para cancelar. Peça nome, data e horário ao cliente.'}`
        );
      }
    }

    // FSM single-intent
    if (this.excellence && this.excellence.fsm) {
      const st = this.excellence.fsm.transition(partnerId, 'session', intent, {});
      facts.push(`ESTADO CONVERSA: ${st.prev || 'INITIAL'} → ${st.state}`);
    }
    return { intent, facts, toolResults, mode: 'pme' };
  }


  /**
   * Multi-intent: uma mensagem pode pedir preço E horário.
   */
  classifyPmeMulti(text) {
    const intents = [];
    const order = ['order', 'pricing', 'catalog', 'booking', 'cancel', 'hours', 'policies', 'location', 'duration', 'thanks', 'greeting'];
    // R1.7: normalizar gírias e regionalismos ANTES do classify
    const rawText = String(text || '');
    let t = rawText;
    if (this.edge && this.edge.regional) {
      const norm = this.edge.regional.normalize(rawText);
      if (norm.regionalHits.length > 0) {
        t = norm.text;
      }
    }
    const checks = {
      order: /\b(comprar|fazer pedido|quero comprar|quero pedir|produto|unidades)\b/i,
      pricing: /\b(pre[cç]o|valor|quanto custa|tabela|or[cç]amento|r\$)\b/i,
      catalog: /\b(servi[cç]os?|cat[aá]logo|card[aá]pio|o que (voc[eê]s?|vc) (faz|oferece))\b/i,
      booking: /\b(agendar|marcar|hor[aá]rio dispon|vaga|reservar|quando posso|quero agendar)\b/i,
      cancel: /\b(cancelar|desmarcar)\b/i,
      hours: /\b(hor[aá]rio de funcionamento|funcionamento|que hora (abre|fecha)|voc[eê]s? abrem)\b/i,
      policies: /\b(pol[ií]tica|forma de pagamento)\b/i,
      location: /\b(onde (fica|voc[eê]s?)|endere[cç]o|como chegar)\b/i,
      duration: /\b(demora|quanto tempo|dura[cç][aã]o)\b/i,
      thanks: /\b(obrigad|valeu)\b/i,
      greeting: /^(oi|ol[aá]|bom dia|boa tarde|boa noite)\b/i
    };
    for (const k of order) {
      if (checks[k] && checks[k].test(t)) intents.push(k);
    }
    if (!intents.length) intents.push('general');
    return intents.slice(0, 3);
  }

  /**
   * Entrada única — multi-intent fusion (isolamento multi-tenant via AsyncLocalStorage).
   */
  async processTurn(params = {}) {
    const { mode, partnerId, userKey, userMessage, googleAccessToken, pushName } = params;
    const lockKey = `${partnerId || 'default'}|${userKey || 'anon'}`;
    return await withTurnLock(lockKey, async () => {
      try {
        return await runWithContext({ googleAccessToken: googleAccessToken || null, partnerId }, async () => {
      const m = 'pme';
      const pid = partnerId || 'usr_google_demo_100';
      const uid = userKey || 'anon';

      console.log(`[PROCESS_TURN] {"mode":"${m}","partnerId":"${pid}","userKey":"${uid}"}`);

      try {
        if (this.edge && this.edge.reactivation) {
          this.edge.reactivation.touch(pid, uid, this.extractClientName(userMessage));
        }
      } catch (_) {}

      const existingDraft = this._readDraft(pid, uid);
      const isConfirming = this._detectConfirmation(userMessage);

      // ── FSM de Pedidos ──────────────────────────────────────────────────────────
      const existingOrderDraft = this._readOrderDraft(pid, uid);
      const tempIntents = this.classifyPmeMulti(userMessage);

      if (existingOrderDraft || tempIntents.includes('order')) {
        let draft = existingOrderDraft || { stage: 'order_draft', items: [] };

        if (/\\b(desistir|esquece|cancela|cancelar)\\b/i.test(userMessage)) {
           this._clearOrderDraft(pid, uid);
        } else {
           let name = this.extractClientName(userMessage, { requireExplicitIntro: !!draft.clientName }) || draft.clientName;
           let cleanPushName = (typeof pushName === 'string' && pushName.trim().length >= 2) ? pushName.trim() : '';
           
           if (!name || name.startsWith('usr_') || name.startsWith('usr_nat_') || name.length < 3) {
             name = null;
           }
           draft.clientName = name || cleanPushName || 'Cliente';
           draft.customerPhone = uid.includes('@') ? uid.split('@')[0] : uid;

           console.log(`[ORDER_FLOW] Analisando pedido de: ${draft.clientName} / ${draft.customerPhone}`);

           const PmeOrderTools = require('../ring2/PmeOrderTools');
           const productCatalog = this._getPartnerProductsCatalog(pid);

           // Tentar regex robusta: "2 bolo", "1 camiseta", "quero uma camiseta", "dois produtos", "1x produto"
           const regex = /(?:(\d+|um|uma|dois|duas|três|tres|quatro|cinco)\s*(?:x|unidades? de|de)?\s*)([a-zA-ZÀ-ÿ0-9\s]+?)(?:(?:\s+e\s+)|,|\.|\n|$)/gi;
           let match;
           let newItems = [];
           
           const wordToNum = { 'um':1, 'uma':1, 'dois':2, 'duas':2, 'três':3, 'tres':3, 'quatro':4, 'cinco':5 };
           
           while ((match = regex.exec(userMessage)) !== null) {
             const qtyRaw = match[1].toLowerCase();
             const quantity = parseInt(qtyRaw) || wordToNum[qtyRaw] || 1;
             const prod = match[2].trim();
             
             if (prod.length > 2 && !/^(reais|vezes|dias|minutos|horas|meses|produto)$/i.test(prod)) {
               // Try to resolve right away for robust mapping
               const resolved = PmeOrderTools.resolveProduct(productCatalog, prod);
               if (resolved) {
                 newItems.push({ quantity, productName: resolved.name, productId: resolved.id, priceCents: resolved.priceCents });
               } else {
                 newItems.push({ quantity, productName: prod }); // store raw if not resolved
               }
             }
           }

           // Se achar pelo menos um produto
           if (newItems.length > 0) {
             draft.items = newItems;
             draft.stage = 'order_review';
             draft.clientConfirmed = false;
           }

           this._saveOrderDraft(pid, uid, draft);

           if (draft.stage === 'order_review' || (draft.items && draft.items.length > 0)) {
             if (isConfirming && draft.stage === 'order_review') {
                console.log(`[ORDER_FLOW] stage=order_confirm_commit client=${draft.clientName}`);
                
                let itemsResolved = [];
                for (const item of draft.items) {
                   const resolved = item.productId ? item : PmeOrderTools.resolveProduct(productCatalog, item.productName);
                   if (resolved && resolved.name) {
                      itemsResolved.push({ 
                        productId: resolved.id || resolved.productId, 
                        productName: resolved.name || resolved.productName, 
                        quantity: item.quantity, 
                        unitPrice: resolved.priceCents || 0 
                      });
                   } else if (productCatalog.length === 0) {
                      // Permitir genérico apenas se não tiver catálogo
                      itemsResolved.push({ productId: 'gen', productName: item.productName, quantity: item.quantity, unitPrice: 0 });
                   } else {
                      console.log(`[ORDER_FLOW] Hard fail: produto inexistente "${item.productName}"`);
                      return {
                        intent: 'order_pending',
                        facts: [`O produto "${item.productName}" não foi encontrado no catálogo de produtos. Peça para o cliente escolher produtos válidos disponíveis na loja.`],
                        toolResults: [],
                        mode: 'pme'
                      };
                   }
                }

                console.log(`[ORDER_COMMIT] Disparando create_order_confirmed | parceiro=${pid}`);
                const result = await this._dispatch('create_order_confirmed', {
                  partnerId: pid,
                  clientName: draft.clientName,
                  customerPhone: draft.customerPhone,
                  items: itemsResolved,
                  confirmed: true
                }, pid);

                this._clearOrderDraft(pid, uid);
                return {
                  intent: 'order_commit',
                  facts: ['PEDIDO REALIZADO E CONFIRMADO COM SUCESSO ✅', 'O pedido foi salvo no sistema. Agradeça e encerre o assunto informando os detalhes.'],
                  toolResults: [result],
                  mode: 'pme'
                };
             } else {
                draft.stage = 'order_review';
                this._saveOrderDraft(pid, uid, draft);
                const itemsList = draft.items.map(i => `${i.quantity}x ${i.productName}`).join(', ');
                return {
                  intent: 'order_pending',
                  facts: [
                    `PEDIDO PRONTO PARA CONFIRMAR.`,
                    `Resumo do pedido: ${itemsList}.`,
                    `Mostre um resumo claro para o cliente (produtos e quantidades) e peça confirmação explícita (SIM).`
                  ],
                  toolResults: [],
                  mode: 'pme'
                };
             }
           } else {
             draft.stage = 'order_draft';
             this._saveOrderDraft(pid, uid, draft);
             return {
               intent: 'order_pending',
               facts: [
                 `ESTADO: order_draft.`,
                 `O cliente demonstrou interesse em fazer um pedido, mas não identificou os produtos e quantidades (ex: "1 camiseta").`,
                 `Pergunte gentilmente quais produtos e quantidades ele deseja adicionar ao pedido.`
               ],
               toolResults: [],
               mode: 'pme'
             };
           }
        }
      }

      // ── G1/G5: Máquina de estados de confirmação e commit de agendamento ───────
      if (existingDraft && isConfirming) {
        const lateName = this.extractClientName(userMessage, { requireExplicitIntro: !!existingDraft.clientName }) || existingDraft.clientName;
        const lateService = this.extractServiceName(userMessage, pid) || existingDraft.serviceName;
        const { dateStr: lateDate, timeSlot: lateSlot } = this.extractDateTimeFromText(userMessage);

        const partnerCatalog = this._getPartnerCatalog(pid);
        const defaultService = (partnerCatalog && partnerCatalog.length > 0 && partnerCatalog[0].name) ? partnerCatalog[0].name : 'Atendimento / Demonstração';
        
        // --- CORREÇÃO: nunca permitir ID interno (usr_nat_*) como nome de cliente ---
        const cleanPushName = (typeof pushName === 'string' && pushName.trim().length >= 2) ? pushName.trim() : '';
        let effectiveClient = lateName || existingDraft.clientName || cleanPushName || '';

        // Rejeita IDs internos e valores inválidos
        if (
          !effectiveClient ||
          effectiveClient.startsWith('usr_') ||
          effectiveClient.startsWith('usr_nat_') ||
          /^[a-f0-9]{8,}$/i.test(effectiveClient) || // hashes genéricos
          effectiveClient.length < 2
        ) {
          effectiveClient = 'Cliente'; // fallback seguro
        }
        const effectiveService = lateService || existingDraft.serviceName || defaultService;
        const effectiveDate = lateDate || existingDraft.dateStr || '';
        const effectiveSlot = lateSlot || existingDraft.timeSlot || '';

        const draft = {
          ...existingDraft,
          clientName: effectiveClient,
          serviceName: effectiveService,
          dateStr: effectiveDate,
          timeSlot: effectiveSlot
        };

        const missing = [];
        if (!draft.dateStr)    missing.push('data');
        if (!draft.timeSlot)   missing.push('horário');

        if (missing.length > 0) {
          console.log(`[BOOKING_FLOW] stage=draft ok=false missing=${missing.join(',')}`);
          this._saveDraft(pid, uid, draft);
          const q = this._nextBookingQuestion(draft) || `Faltam: ${missing.join(', ')}. Pergunte só o que falta.`;
          return {
            intent: 'booking_pending',
            facts: [
              `FALTAM DADOS DO CLIENTE (não é espera de equipe): ${missing.join(', ')}.`,
              `Faça UMA pergunta apenas: ${q}`,
              'NÃO peça data no formato xx/xx/xxxx. Aceite "amanhã", "terça às 14h", etc. NUNCA diga que aguarda equipe técnica.'
            ],
            toolResults: [],
            mode: 'pme'
          };
        }

        if (!existingDraft.clientConfirmed) {
          draft.clientConfirmed = true;
          this._saveDraft(pid, uid, draft);
          let when = `${draft.dateStr} às ${draft.timeSlot}`;
          try {
            const BDT = require('../ring2/BookingDateTime');
            when = BDT.formatFriendly(draft.dateStr, draft.timeSlot);
          } catch (_) {}
          return {
            intent: 'booking_pending',
            facts: [
              `AGENDAMENTO PRONTO PARA CONFIRMAR.`,
              `Resumo: *${draft.serviceName}* · ${when} · cliente ${draft.clientName}${draft.priceLabel ? ' · ' + draft.priceLabel : ''}.`,
              `Peça confirmação final em UMA frase legível (ex.: "Confirmo *${draft.serviceName}* em ${when} em nome de ${draft.clientName}?").`,
              'NÃO diga que já está agendado. NÃO diga que a equipe humana vai confirmar. Aguarde o SIM.'
            ],
            toolResults: [],
            mode: 'pme'
          };
        }

        console.log(`[BOOKING_FLOW] stage=confirm_commit ok=true service=${draft.serviceName} date=${draft.dateStr} slot=${draft.timeSlot} client=${draft.clientName}`);
        console.log(`[BOOKING_COMMIT] Disparando book_appointment_confirmed | parceiro=${pid} cliente=${draft.clientName} serviço=${draft.serviceName} data=${draft.dateStr} hora=${draft.timeSlot}`);

        // --- CORREÇÃO: nunca aceitar serviceName que não exista no catálogo ---
        const catalogForCommit = partnerCatalog || this._getPartnerCatalog(pid) || [];

        if (!catalogForCommit || catalogForCommit.length === 0) {
          // Catálogo vazio → força serviço genérico e registra warning
          console.warn(`[PME_BOOKING] Catálogo vazio para partner. Forçando "Serviço Genérico"`);
          draft.serviceName = 'Serviço Genérico';
          draft.serviceId = 'generic';
        } else {
          const PmeBookingTools = require('../ring2/PmeBookingTools');
          const resolved = PmeBookingTools.resolveService(catalogForCommit, draft.serviceName, draft.serviceId);

          if (!resolved || !resolved.id) {
            // Hard Fail real: texto da conversa não bateu com nenhum serviço
            _metric('catalog_miss', pid, { serviceName: draft.serviceName });
            const names = catalogForCommit.map((s) => s.name).filter(Boolean).slice(0, 8);
            this._saveDraft(pid, uid, { ...draft, serviceName: '' });
            return {
              intent: 'booking_pending',
              facts: [
                `CATÁLOGO: o serviço "${draft.serviceName}" não está cadastrado no painel.`,
                names.length
                  ? `Serviços disponíveis: ${names.join('; ')}. Pergunte qual desses o cliente deseja — uma pergunta só.`
                  : 'Peça ao cliente para escolher um serviço da lista do estabelecimento.',
                'NUNCA invente preço ou nome de serviço. NUNCA diga que a equipe humana vai confirmar.'
              ],
              toolResults: [],
              mode: 'pme'
            };
          }

          draft.serviceName = resolved.name;
          draft.serviceId = resolved.id;
          draft.serviceTag = resolved.tag;
          draft.priceLabel = resolved.priceLabel;
          draft.durationMinutes = resolved.durationMinutes;
        }

        // Re-check de slot no SIM (anti-corrida)
        try {
          const PmeBookingTools = require('../ring2/PmeBookingTools');
          if (typeof PmeBookingTools.setConfigurator === 'function' && this.pme) {
            PmeBookingTools.setConfigurator(this.pme);
          }
          const live = PmeBookingTools.getAvailableSlots({
            partnerId: pid,
            dateStr: draft.dateStr,
            serviceName: draft.serviceName,
            serviceId: draft.serviceId
          });
          const stillFree =
            live &&
            live.ok &&
            Array.isArray(live.slots) &&
            live.slots.some((s) => String(s.timeSlot) === String(draft.timeSlot));
          if (!stillFree) {
            _metric('booking_conflict', pid, {
              dateStr: draft.dateStr,
              timeSlot: draft.timeSlot,
              serviceName: draft.serviceName
            });
            const alt = (live && live.slots && live.slots[0]) || null;
            let altMsg = 'Peça outro horário.';
            if (alt) {
              let when = `${live.dateStr || draft.dateStr} às ${alt.timeSlot}`;
              try {
                const BDT = require('../ring2/BookingDateTime');
                when = BDT.formatFriendly(live.dateStr || draft.dateStr, alt.timeSlot);
              } catch (_) {}
              altMsg = `Sugira o próximo livre: ${when}.`;
              draft.timeSlot = alt.timeSlot;
              draft.dateStr = live.dateStr || draft.dateStr;
              this._saveDraft(pid, uid, { ...draft, clientConfirmed: false });
            }
            return {
              intent: 'booking_pending',
              facts: [
                `CONFLITO DE AGENDA: o horário ${draft.timeSlot} em ${draft.dateStr} acabou de ficar indisponível.`,
                altMsg,
                'NÃO confirme o horário antigo. Faça UMA pergunta: se o cliente aceita o novo horário sugerido.'
              ],
              toolResults: [live],
              mode: 'pme'
            };
          }
        } catch (reErr) {
          console.warn('[BOOKING_FLOW] re-check slot failed:', reErr.message);
        }

        const commitId = `${pid}|${uid}|${draft.serviceName}|${draft.dateStr}|${draft.timeSlot}`;
        if (!this._recentCommits) this._recentCommits = new Map();
        const lastCommit = this._recentCommits.get(commitId);
        if (lastCommit && Date.now() - lastCommit < 30000) {
          console.log('[IDEMPOTENCY] Duplicated commit prevented for:', commitId);
          this._clearDraft(pid, uid);
          return {
            intent: 'booking_commit',
            facts: ['AGENDAMENTO CONFIRMADO ✅', 'O agendamento já foi processado e confirmado com sucesso. Agradeça ao cliente e encerre o assunto. NÃO exija ou pergunte sobre forma de pagamento.'],
            toolResults: [],
            mode: 'pme'
          };
        }
        this._recentCommits.set(commitId, Date.now());

        const bookResult = await this._dispatch('book_appointment_confirmed', {
          partnerId: pid,
          clientName: draft.clientName,
          serviceName: draft.serviceName,
          serviceId: draft.serviceId,
          dateStr: draft.dateStr,
          timeSlot: draft.timeSlot,
          customerPhone: uid.includes('@') ? uid.split('@')[0] : undefined,
          confirmed: true
        }, pid);

        this._clearDraft(pid, uid);

        const commitFacts = [];
        if (bookResult && bookResult.ok) {
          _metric('booking_confirmed', pid, {
            serviceName: draft.serviceName,
            dateStr: draft.dateStr,
            timeSlot: draft.timeSlot,
            appointmentId: bookResult.appointment && bookResult.appointment.appointmentId
          });
          console.log(`[BOOKING_FLOW] stage=commit ok=true id=${bookResult.appointment?.appointmentId || 'ok'}`);
          commitFacts.push(`AGENDAMENTO CONFIRMADO ✅: ${bookResult.message || `${draft.clientName} — ${draft.serviceName} em ${draft.dateStr} às ${draft.timeSlot}`}. ATENÇÃO: O agendamento está concluído. Agradeça e encerre. NÃO faça cobranças nem exija forma de pagamento.`);

          let calToken = googleAccessToken || (getContext() && getContext().googleAccessToken) || null;
          if (!calToken && this.authManager && typeof this.authManager.ensureValidGoogleAccessToken === 'function') {
            try {
              calToken = await this.authManager.ensureValidGoogleAccessToken(pid);
            } catch (_) {}
          }
          if (!calToken && process.env.GOOGLE_ACCESS_TOKEN && process.env.NODE_ENV !== 'production') {
            calToken = process.env.GOOGLE_ACCESS_TOKEN;
          }
          const normalizedSlot = normalizeTime(draft.timeSlot);
          const startLocal = `${draft.dateStr}T${normalizedSlot}`;
          const timeZone = process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Sao_Paulo';
          const durationMin = (bookResult.appointment && bookResult.appointment.durationMinutes) || 30;

          if (process.env.DISABLE_GOOGLE_AUTH === 'true') {
            commitFacts.push(`AGENDAMENTO LOCAL: serviço=${draft.serviceName} data=${draft.dateStr} horário=${draft.timeSlot} cliente=${draft.clientName}`);
            commitFacts.push('CALENDAR_GOOGLE: isolado — evento NÃO criado no Google (modo lista/PDF).');
            console.log(`[CALENDAR] path=booking_commit token=skip reason=DISABLE_GOOGLE_AUTH start=${startLocal}`);
          } else {
            if (calToken) {
              try {
                let calResult = await this._dispatch('calendar_create', {
                accessToken: calToken,
                summary: `${draft.serviceName} — ${draft.clientName}`,
                start: startLocal,
                durationMinutes: durationMin,
                description: 'Agendado pelo MAX Atendente PME',
                timeZone
              }, pid);

              const isExpired = calResult?.reason === 'TOKEN_EXPIRED' || calResult?.httpStatus === 401;

              // Se der TOKEN_EXPIRED (401), tenta refresh forçado UMA vez e repete
              if (isExpired && this.authManager && typeof this.authManager.ensureValidGoogleAccessToken === 'function') {
                console.log(`[CALENDAR] path=booking_commit token=yes ok=false reason=TOKEN_EXPIRED httpStatus=401 -> attempting refresh...`);
                const refreshedToken = await this.authManager.ensureValidGoogleAccessToken(pid, true);
                if (refreshedToken) {
                  getContext().googleAccessToken = refreshedToken;
                  calResult = await this._dispatch('calendar_create', {
                    accessToken: refreshedToken,
                    summary: `${draft.serviceName} — ${draft.clientName}`,
                    start: startLocal,
                    durationMinutes: durationMin,
                    description: 'Agendado pelo MAX Atendente PME',
                    timeZone
                  }, pid);
                  const retryOk = calResult?.ok === true;
                  const retryEventId = calResult?.eventId || calResult?.event?.id || 'none';
                  console.log(`[CALENDAR] path=booking_commit retry_after_refresh ok=${retryOk} eventId=${retryEventId}`);
                }
              }

              const isOk = calResult?.ok === true;
              const eventId = calResult?.eventId || calResult?.event?.id || null;
              const isNeedOauth = calResult?.status === 'NEED_OAUTH' || calResult?.reason === 'NEED_OAUTH' || calResult?.reason === 'TOKEN_EXPIRED';
              const reason = calResult?.reason || (isOk ? 'SUCCESS' : 'ERROR');
              const httpStatus = calResult?.httpStatus ? ` httpStatus=${calResult.httpStatus}` : '';
              const endInfo = calResult?.event?.end?.dateTime || 'auto';

              console.log(`[CALENDAR] path=booking_commit token=yes ok=${isOk} reason=${reason} eventId=${eventId || 'none'} start=${startLocal} end=${endInfo}${httpStatus}`);

              if (isOk) {
                commitFacts.push(`GOOGLE CALENDAR: evento criado ✅ (${eventId || 'ok'})`);
              } else if (isNeedOauth) {
                commitFacts.push('GOOGLE CALENDAR: token OAuth expirado ou sem permissão — agendamento salvo internamente.');
              } else {
                const errMsg = String(calResult?.message || calResult?.reason || 'falha').slice(0, 200);
                commitFacts.push(`GOOGLE CALENDAR: falhou (${errMsg}) — agendamento interno OK.`);
              }
            } catch (calErr) {
              console.warn(`[CALENDAR] path=booking_commit token=yes ok=false reason=EXCEPTION eventId=none start=${startLocal} error=${calErr.message}`);
              commitFacts.push(`GOOGLE CALENDAR: erro inesperado (${String(calErr.message).slice(0, 200)}) — agendamento interno OK.`);
            }
          } else {
            console.log(`[CALENDAR] path=booking_commit token=no reason=NEED_OAUTH start=${startLocal}`);
            commitFacts.push('GOOGLE CALENDAR: conta Google não conectada — agendamento salvo apenas internamente. Peça para o cliente conectar o Google Calendar.');
          }
        } // fecha else DISABLE_GOOGLE_AUTH
        
        return { intent: 'booking_confirmed', facts: commitFacts, toolResults: [bookResult], mode: 'pme' };
        
      } else {
        const reason = (bookResult && (bookResult.message || bookResult.reason)) || 'erro desconhecido';
        console.warn(`[BOOKING_FLOW] stage=commit ok=false reason=${reason}`);
        if (bookResult && (bookResult.reason === 'SLOT_TAKEN' || bookResult.reason === 'SLOT_LOCKED')) {
          _metric('booking_conflict', pid, {
            dateStr: draft.dateStr,
            timeSlot: draft.timeSlot,
            serviceName: draft.serviceName,
            reason: bookResult.reason
          });
        }
        commitFacts.push(`AGENDAMENTO FALHOU ❌: ${reason}. Informe o cliente e ofereça outro horário ou data — UMA pergunta.`);
        if (bookResult && bookResult.alternatives && bookResult.alternatives.length) {
          const a = bookResult.alternatives[0];
          commitFacts.push(`Alternativa livre: ${a.timeSlot}. Pergunte se o cliente aceita.`);
        }
        return { intent: 'booking_confirmed', facts: commitFacts, toolResults: [bookResult], mode: 'pme' };
      }
    }

    // ── Atualizar draft com informações parciais ──────────────────────────────
    let newName = this.extractClientName(userMessage, { requireExplicitIntro: !!(existingDraft && existingDraft.clientName) });
    if (!newName && pushName && pushName.trim().length >= 2) {
      newName = pushName.trim();
    }
      const newService = this.extractServiceName(userMessage, pid);
      const { dateStr: newDate, timeSlot: newSlot } = this.extractDateTimeFromText(userMessage);

      if (/\b(desistir|esquece|cancela|cancelar)\b/i.test(userMessage)) {
        this._clearDraft(pid, uid);
      } else if (newName || newService || newDate || newSlot) {
        const curDraft = existingDraft || {};
        const updated = {
          ...curDraft,
          clientName:  newName    || curDraft.clientName  || '',
          serviceName: newService || curDraft.serviceName || '',
          dateStr:     newDate    || curDraft.dateStr     || '',
          timeSlot:    newSlot    || curDraft.timeSlot    || ''
        };
        if (
          (newName && newName !== curDraft.clientName) ||
          (newService && newService !== curDraft.serviceName) ||
          (newDate && newDate !== curDraft.dateStr) ||
          (newSlot && newSlot !== curDraft.timeSlot)
        ) {
          updated.clientConfirmed = false;
        }
        this._saveDraft(pid, uid, updated);
        console.log(`[BOOKING_FLOW] stage=draft ok=true draft=${JSON.stringify(updated)}`);
      }

      // ── Classificação e execução normal ──────────────────────────────────────
      const intents = this.classifyPmeMulti(userMessage);
      const merged = { intent: intents.join('+'), facts: [], toolResults: [], mode: 'pme' };
      const seen = new Set();

      if (intents.length === 1) {
        const result = await this.runPmeActions(pid, userMessage, pushName, uid);
        if (intents[0] === 'booking' && result.facts && result.facts.__bookingDraftSeed) {
          const seed = result.facts.__bookingDraftSeed;
          const cur = this._readDraft(pid, uid) || {};
          const saved = {
            ...cur,
            clientName:  seed.clientName  || cur.clientName  || '',
            contactPhone: seed.contactPhone || cur.contactPhone || '',
            serviceName: seed.serviceName || cur.serviceName || '',
            dateStr:     seed.dateStr     || cur.dateStr     || '',
            timeSlot:    seed.timeSlot    || cur.timeSlot    || ''
          };
          this._saveDraft(pid, uid, saved);
          console.log(`[BOOKING_FLOW] stage=draft ok=true draft=${JSON.stringify(saved)}`);
          delete result.facts.__bookingDraftSeed;
        }
        return result;
      }

      // Multi-intent: percorrer cada intent sequencialmente
      for (const intent of intents) {
        if (seen.has(intent)) continue;
        seen.add(intent);
        const r = await this.runPmeActionsForIntent(pid, userMessage, intent, pushName, uid);
        merged.facts.push(...(r.facts || []));
        merged.toolResults.push(...(r.toolResults || []));
      }

      if (intents.includes('booking')) {
        const cur = this._readDraft(pid, uid) || {};
        const consolidated = {
          ...cur,
          clientName:  newName    || cur.clientName  || '',
          serviceName: newService || cur.serviceName || '',
          dateStr:     newDate    || cur.dateStr     || new Date().toISOString().slice(0, 10),
          timeSlot:    newSlot    || cur.timeSlot    || ''
        };
        if (
          (newName && newName !== cur.clientName) ||
          (newService && newService !== cur.serviceName) ||
          (newDate && newDate !== cur.dateStr) ||
          (newSlot && newSlot !== cur.timeSlot)
        ) {
          consolidated.clientConfirmed = false;
        }
        this._saveDraft(pid, uid, consolidated);
        console.log(`[BOOKING_FLOW] stage=draft ok=true draft=${JSON.stringify(consolidated)}`);
      }

      let name = this.extractClientName(userMessage, { requireExplicitIntro: !!(existingDraft && existingDraft.clientName) });
      if (!name && pushName && pushName.trim().length >= 2) {
        name = pushName.trim();
        merged.facts.push(`NOME DO CLIENTE NO WHATSAPP: "${name}". Informe que vai agendar no nome de ${name} e peça apenas para ele confirmar se está correto. NÃO peça para digitar o nome.`);
      } else if (name) {
        merged.facts.push(`NOME DO CLIENTE DETECTADO: ${name}`);
      }
      if (this.excellence && this.excellence.fsm) {
        const st = this.excellence.fsm.transition(pid, uid, merged.intent, {
          clientName: name || undefined
        });
        merged.facts.push(`ESTADO CONVERSA: ${st.prev || 'INITIAL'} → ${st.state}`);
        const conf = this.excellence.fsm.confirmationScript(st.payload);
        if (conf) merged.facts.push(conf);
      }
      if (this._lastAudioExecutive && this._lastAudioExecutive.actionPrompt) {
        merged.facts.push(`RESPOSTA_SUGERIDA_AUDIO: ${this._lastAudioExecutive.actionPrompt}`);
      }
      return merged;
        });
      } catch (fatalErr) {
        console.error('[PROCESS_TURN_FATAL]', fatalErr.message);
        return {
          intent: 'error',
          facts: [
            'ERRO INTERNO TEMPORÁRIO: ' + fatalErr.message,
            'NÃO afirme agendamento confirmado neste turno.'
          ],
          toolResults: [],
          mode: 'pme'
        };
      }
    });
  }

  /** Executa um intent PME isolado (para fusão). */
  async runPmeActionsForIntent(partnerId, userMessage, intent, pushName, userKey) {
    // Reusa runPmeActions mas com mensagem tag se needed - simplest: monkey by wrapping message
    const tagMap = {
      pricing: 'quanto custa ',
      catalog: 'quais serviços ',
      booking: 'quero agendar ',
      cancel: 'quero cancelar ',
      hours: 'horário de funcionamento ',
      policies: 'política de pagamento ',
      location: 'onde fica ',
      duration: 'quanto tempo demora ',
      thanks: 'obrigado ',
      greeting: 'olá ',
      general: ''
    };
    // Direct call runPmeActions with biased message that still contains original
    const bias = (tagMap[intent] || '') + userMessage;
    // Override classify by running internal copy - call runPmeActions and filter
    // Actually simplest: duplicate tool calls for intent
    const facts = [];
    const toolResults = [];
    if (intent === 'pricing' || intent === 'catalog') {
      const r = await this._dispatch('list_services', { partnerId }, partnerId);
      toolResults.push(r);
      if (r && r.ok && r.services) {
        facts.push('CATÁLOGO REAL:\n' + r.services.map((s) => `${s.name}: ${s.priceLabel} (${s.durationMinutes} min)`).join('\n'));
      }
    } else if (intent === 'hours') {
      const r = await this._dispatch('get_business_hours', { partnerId }, partnerId);
      toolResults.push(r);
      if (r && r.ok) facts.push(r.message || JSON.stringify(r.workingHours));
    } else if (intent === 'policies') {
      const r = await this._dispatch('get_store_policies', { partnerId }, partnerId);
      toolResults.push(r);
      if (r && r.ok) facts.push('POLÍTICAS: ' + JSON.stringify(r.policies || {}));
    } else if (intent === 'booking') {
      const day = /amanh[aã]/i.test(userMessage)
        ? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const slots = await this._dispatch('get_next_available_slot', { partnerId, dateStr: day }, partnerId);
      toolResults.push(slots);
      if (slots && slots.ok && slots.next) {
        facts.push(`PRÓXIMO HORÁRIO LIVRE (${day}): ${slots.next.timeSlot}`);
      }
      const name = this.extractClientName(userMessage);
      const val = await this._dispatch('validate_booking_ready', {
        partnerId,
        clientName: name || '',
        serviceName: '',
        dateStr: day,
        timeSlot: (slots && slots.next && slots.next.timeSlot) || ''
      }, partnerId);
      if (val && val.ok) facts.push(val.message);
    } else if (intent === 'location' || intent === 'duration' || intent === 'greeting' || intent === 'thanks' || intent === 'cancel') {
      return this.runPmeActions(partnerId, (tagMap[intent] || '') + userMessage, pushName, userKey);
    }
    return { intent, facts, toolResults, mode: 'pme' };
  }


  formatFactsBlock(actionResult) {
    if (!actionResult || !actionResult.facts || !actionResult.facts.length) return '';
    const googleDisabled = process.env.DISABLE_GOOGLE_AUTH === 'true';
    const localFact = googleDisabled ? '  MODO AGENDA LOCAL (PDF): Não use tools de Google Calendar.\n' : '';
    return (
      `\n\n[FATOS VERIFICADOS PELO SISTEMA - SIGA ESTRITAMENTE ESTAS INSTRUÇÕES]\n` +
      localFact +
      actionResult.facts.map((f) => `  ${f}`).join('\n') +
      `\n• ⚠️ REGRA INVIOLÁVEL DE AGENDAMENTO: Só diga que está confirmado se aparecer 'AGENDAMENTO CONFIRMADO ✅'. Se faltar dado (nome/serviço/data/hora), peça SÓ o que falta — uma pergunta. NUNCA diga que está aguardando equipe, equipe técnica, confirmação humana ou retorno da equipe. NUNCA invente planos Premium, upsell ou links que não estejam nos fatos/catálogo.\n` +
      `• 🎭 PERSONALIDADE OBRIGATÓRIA: Mantenha SEMPRE o tom de voz, estilo e personalidade definidos nas [INSTRUÇÕES E PERSONALIDADE DO ATENDENTE] do system prompt. Todas as respostas devem refletir essa identidade — não adote um tom genérico ou robótico.\n` +
      `[Fim dos fatos do sistema. Resposta curta em português, estilo WhatsApp, mantendo a personalidade configurada.]\n`
    );
  }
}

module.exports = { MaxAgentRuntime };
