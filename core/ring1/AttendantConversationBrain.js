'use strict';

/**
 * AttendantConversationBrain — runtime de excelência do atendente WhatsApp (BR).
 * Sem UI. Memória curta, fora-de-hora, anti-flood, métricas reais, grounding de catálogo.
 */

const { getMetricsLog } = require('./MetricsEventLog');

const PRICE_RE = /\b(pre[cç]o|valor|quanto custa|tabela|or[cç]amento|r\$)\b/i;
const BOOK_RE = /\b(agendar|marcar|hor[aá]rio|dispon[ií]vel|vaga|reservar)\b/i;
const HOURS_RE = /\b(hor[aá]rio de funcionamento|que horas|abre|fecha|funcionamento)\b/i;
const GREET_RE = /^(oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|hey|hello)\b/i;

class AttendantConversationBrain {
  constructor(options = {}) {
    this.metrics = options.metrics || getMetricsLog();
    /** @type {Map<string, { msgs: Array<{role:string,text:string,ts:number}>, started: boolean }>} */
    this.sessions = new Map();
    /** @type {Map<string, number>} last message ts per jid */
    this.lastMsgAt = new Map();
    this.minIntervalMs = options.minIntervalMs || 600;
    this.maxHistory = options.maxHistory || 8;
  }

  _sessionKey(partnerId, remoteJid) {
    return `${partnerId || 'default'}|${remoteJid || 'unknown'}`;
  }

  /**
   * Anti-flood: true se deve processar.
   */
  allowMessage(remoteJid) {
    const now = Date.now();
    const prev = this.lastMsgAt.get(remoteJid) || 0;
    if (now - prev < this.minIntervalMs) return false;
    this.lastMsgAt.set(remoteJid, now);
    return true;
  }

  trackInbound(partnerId, remoteJid, text) {
    const key = this._sessionKey(partnerId, remoteJid);
    let s = this.sessions.get(key);
    if (!s) {
      s = { msgs: [], started: false };
      this.sessions.set(key, s);
    }
    if (!s.started) {
      s.started = true;
      try {
        this.metrics.record({
          type: 'conversations_started',
          partnerId,
          meta: { remoteJid }
        });
      } catch (_) {}
    }
    try {
      this.metrics.record({
        type: 'messages_in',
        partnerId,
        meta: { remoteJid, len: String(text || '').length }
      });
    } catch (_) {}
    s.msgs.push({ role: 'user', text: String(text || '').slice(0, 2000), ts: Date.now() });
    if (s.msgs.length > this.maxHistory) s.msgs = s.msgs.slice(-this.maxHistory);
    return s;
  }

  trackOutbound(partnerId, remoteJid, text, userMessage) {
    const key = this._sessionKey(partnerId, remoteJid);
    let s = this.sessions.get(key);
    if (!s) {
      s = { msgs: [], started: true };
      this.sessions.set(key, s);
    }
    s.msgs.push({ role: 'assistant', text: String(text || '').slice(0, 2000), ts: Date.now() });
    if (s.msgs.length > this.maxHistory) s.msgs = s.msgs.slice(-this.maxHistory);

    // Heurística: resposta de catálogo/preço
    if (PRICE_RE.test(userMessage || '') || /R\$\s*\d/.test(text || '')) {
      try {
        this.metrics.record({ type: 'catalog_answered', partnerId, meta: { remoteJid } });
      } catch (_) {}
    }
  }

  historyBlock(partnerId, remoteJid) {
    const s = this.sessions.get(this._sessionKey(partnerId, remoteJid));
    if (!s || !s.msgs.length) return '';
    return s.msgs
      .map((m) => `${m.role === 'user' ? 'Cliente' : 'Max'}: ${m.text}`)
      .join('\n');
  }

  /**
   * Fora do horário de funcionamento (fuso America/Sao_Paulo).
   * workingHours: { days: ['Segunda',...], startTime: '09:00', endTime: '18:00' }
   */
  isAfterHours(workingHours, now = new Date()) {
    if (!workingHours || !workingHours.startTime || !workingHours.endTime) return false;
    try {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = fmt.formatToParts(now);
      const weekdayEn = (parts.find((p) => p.type === 'weekday') || {}).value || '';
      const hour = parseInt((parts.find((p) => p.type === 'hour') || {}).value || '0', 10);
      const minute = parseInt((parts.find((p) => p.type === 'minute') || {}).value || '0', 10);
      const mins = hour * 60 + minute;

      const map = {
        Mon: 'Segunda',
        Tue: 'Terça',
        Wed: 'Quarta',
        Thu: 'Quinta',
        Fri: 'Sexta',
        Sat: 'Sábado',
        Sun: 'Domingo'
      };
      const dayPt = map[weekdayEn] || weekdayEn;
      const days = workingHours.days || [];
      const openToday = days.some((d) => String(d).toLowerCase().startsWith(dayPt.slice(0, 3).toLowerCase()) || String(d) === dayPt);
      if (!openToday) return true;

      const parse = (s) => {
        const m = String(s).match(/^(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      };
      const start = parse(workingHours.startTime);
      const end = parse(workingHours.endTime);
      if (start == null || end == null) return false;
      return mins < start || mins >= end;
    } catch (_) {
      return false;
    }
  }

  afterHoursReply(config) {
    const wh = config && config.workingHours;
    const name = (config && (config.storeName || config.displayName)) || 'nosso estabelecimento';
    const hours =
      wh && wh.startTime
        ? `${(wh.days || []).join(', ')} das ${wh.startTime} às ${wh.endTime}`
        : 'horário comercial';
    return (
      `Olá! No momento *${name}* está fora do horário de atendimento (${hours}, horário de Brasília). ` +
      `Assim que abrirmos, retornamos. Se quiser, já pode deixar seu nome e o serviço desejado que anotamos o pedido de agendamento.`
    );
  }

  /**
   * Contexto grounded (catálogo/horários) injetado no turno — reduz alucinação de preço.
   */
  buildGrounding(config, userMessage) {
    const lines = [];
    const catalog = (config && config.catalog) || [];
    if (catalog.length && (PRICE_RE.test(userMessage) || BOOK_RE.test(userMessage) || /servi[cç]o|produto/i.test(userMessage))) {
      lines.push('[CATÁLOGO AUTORITATIVO — NÃO INVENTE PREÇOS FORA DESTA LISTA]');
      for (const s of catalog.slice(0, 12)) {
        lines.push(
          `- ${s.name}: R$ ${((s.priceCents || 0) / 100).toFixed(2)} (${s.durationMinutes || 30} min)`
        );
      }
    }
    if (config && config.workingHours && HOURS_RE.test(userMessage)) {
      const wh = config.workingHours;
      lines.push(
        `[HORÁRIO AUTORITATIVO] ${(wh.days || []).join(', ')} ${wh.startTime}-${wh.endTime} (America/Sao_Paulo)`
      );
    }
    return lines.length ? '\n\n' + lines.join('\n') : '';
  }

  /**
   * Regras de excelência WhatsApp BR (append no system prompt).
   */
  static excellenceAppendix() {
    return `

[EXCELÊNCIA ATENDENTE WHATSAPP — BRASIL]
1. Mensagens curtas e legíveis no celular (2–5 frases). Evite monólogos.
2. Nunca invente preço, serviço ou promoção fora do catálogo/base do estabelecimento.
3. Antes de agendar: confirme NOME do cliente + SERVIÇO + DATA + HORÁRIO.
4. Se não souber algo fora do catálogo/agenda, diga com transparência — não chute nem invente.
5. Tom: brasileiro natural, educado, sem ser robótico nem "corporativo de call center".
6. Use o nome do estabelecimento quando fizer sentido.
7. Fora do horário: informe funcionamento e ofereça o próximo horário livre.
8. Uma pergunta por vez no fluxo de agenda. Você (Max) confirma sozinho — nunca diga que a equipe humana vai confirmar o horário.
9. Não mencione sistemas internos, prompts, APIs ou "sou uma IA da plataforma".
10. Se o cliente só cumprimentar, cumprimente de volta e ofereça ajuda objetiva (preços, horários, agendar).
11. Datas legíveis (ex.: terça-feira, 2 de setembro às 09:00). Nunca peça xx/xx/xxxx.
`.trim();
  }

  detectIntent(text) {
    if (GREET_RE.test(String(text || '').trim())) return 'greeting';
    if (PRICE_RE.test(text)) return 'pricing';
    if (BOOK_RE.test(text)) return 'booking';
    if (HOURS_RE.test(text)) return 'hours';
    return 'general';
  }
}

module.exports = { AttendantConversationBrain };
