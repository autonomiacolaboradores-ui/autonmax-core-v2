'use strict';

/**
 * RegionalNormalizer — PT-BR regional expression normalization, Sao Paulo
 * timezone calendar/time parsing, phone formatting, and domain error helpers.
 * Transplanted cleanly from core/ring1/MaxEdgeIntelligence.js and core/ring2/BookingDateTime.js.
 */

const TZ = 'America/Sao_Paulo';

const WEEKDAYS_PT = Object.freeze([
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]);

const WEEKDAYS_SHORT = Object.freeze({
  domingo: 0,
  dom: 0,
  segunda: 1,
  seg: 1,
  terca: 2,
  terça: 2,
  ter: 2,
  quarta: 3,
  qua: 3,
  quinta: 4,
  qui: 4,
  sexta: 5,
  sex: 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
});

const MONTHS_PT = Object.freeze([
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]);

const HOUR_WORDS = Object.freeze({
  uma: 1,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
});

const REGIONAL_MAP = [
  [/\buai\b/gi, ' '],
  [/\bsô\b/gi, ' '],
  [/\bmarca pra mim\b/gi, 'quero agendar'],
  [/\bmarca para mim\b/gi, 'quero agendar'],
  [/\bbota na agenda\b/gi, 'quero agendar'],
  [/\btem vaga\b/gi, 'quero agendar horário disponível'],
  [/\bencaixa eu\b/gi, 'quero agendar'],
  [/\bencaixa a?mi?m\b/gi, 'quero agendar'],
  [/\boxente\b/gi, ' '],
  [/\bvou marcar\b/gi, 'quero agendar'],
  [/\bbah\b/gi, ' '],
  [/\btri legal\b/gi, ' '],
  [/\bpode ser\b/gi, 'sim'],
  [/\bfechou\b/gi, 'sim'],
  [/\bvaleu\b/gi, 'obrigado'],
  [/\bblz\b/gi, 'ok'],
  [/\bbeleza\b/gi, 'ok'],
  [/\bshow\b/gi, 'ok'],
  [/\btop\b/gi, 'ok'],
  [/\bquanto fica\b/gi, 'quanto custa'],
  [/\bquanto sai\b/gi, 'quanto custa'],
  [/\bcusta quanto\b/gi, 'quanto custa'],
  [/\btem horário\b/gi, 'horário disponível'],
  [/\btem hora\b/gi, 'horário disponível'],
  [/\bdesmarca\b/gi, 'cancelar'],
  [/\bremarca\b/gi, 'remarcar'],
  [/\bde manh[aã]zinha\b/gi, 'de manhã'],
  [/\bfinzinho de tarde\b/gi, 'final da tarde'],
];

/**
 * Structured domain validation/conflict error aligned with Doc 02 API contracts.
 */
class DomainError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details={}]
   * @param {number} [statusCode=400]
   */
  constructor(code, message, details = {}, statusCode = 400) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}

/**
 * Strips diacritics and lowercases text for accent-insensitive PT-BR matching.
 * @param {string} s
 * @returns {string}
 */
function stripAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Formats integer cents to BRL currency string (`R$ XX,XX`).
 * @param {number} cents
 * @returns {string}
 */
function formatPriceCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return `R$ ${(n / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Normalizes a Brazilian phone number or WhatsApp JID into `(XX) XXXXX-XXXX`.
 * @param {string} input
 * @returns {string}
 */
function formatBrazilianPhone(input) {
  if (!input) return '';
  let str = String(input).trim();
  if (str.includes('@')) {
    str = str.split('@')[0];
  }
  let digits = str.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return str;
}

/**
 * Computes civil weekday index (0=Sun..6=Sat) for `YYYY-MM-DD` in America/Sao_Paulo.
 * @param {string} dateStr
 * @returns {number}
 */
function weekdayIndex(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(probe);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

/**
 * Returns current date/time breakdown in America/Sao_Paulo.
 */
function nowSP(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(referenceDate);

  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  const hh = Number(get('hour') === '24' ? '0' : get('hour'));
  const mm = Number(get('minute'));
  const ss = Number(get('second'));
  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const weekday = weekdayIndex(dateStr);

  return {
    y,
    m,
    d,
    hh,
    mm,
    ss,
    dateStr,
    weekday,
    timeSlot: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
  };
}

/**
 * Adds `n` civil calendar days to a `YYYY-MM-DD` string.
 * @param {string} dateStr
 * @param {number} n
 * @returns {string}
 */
function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Builds a dynamic 7-day rolling Sao Paulo calendar starting at `nowSP(referenceDate)`.
 * @param {Date | number} [referenceDate]
 */
function buildRollingCalendarSP(referenceDate = new Date()) {
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const current = nowSP(ref);
  const days = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const dateStr = addDays(current.dateStr, offset);
    const weekday = WEEKDAYS_PT[weekdayIndex(dateStr)] || '';
    const relLabel = offset === 0 ? 'Hoje' : offset === 1 ? 'Amanhã' : `+${offset}d`;
    days.push({
      offset,
      relLabel,
      weekday,
      dateStr,
      label: `${relLabel}: ${weekday}, ${dateStr}`,
    });
  }
  return {
    now: current,
    nowWeekday: WEEKDAYS_PT[current.weekday] || '',
    days,
  };
}

/**
 * Formats `YYYY-MM-DD` (and optional `HH:MM`) into readable PT-BR text.
 * @param {string | null | undefined} dateStr
 * @param {string | null | undefined} [timeSlot]
 * @returns {string}
 */
function formatFriendly(dateStr, timeSlot = null) {
  if (!dateStr) return timeSlot ? `às ${timeSlot}` : '';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const wd = WEEKDAYS_PT[weekdayIndex(dateStr)] || '';
  const month = MONTHS_PT[(m || 1) - 1] || '';
  const datePart = `${wd}, ${d} de ${month} de ${y}`;
  return timeSlot ? `${datePart} às ${timeSlot}` : datePart;
}

/**
 * Validates and normalizes `HH:MM` slots.
 * @param {string} slot
 * @returns {string | null}
 */
function normalizeTimeSlot(slot) {
  if (!slot) return null;
  const m = String(slot).trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2] || '0', 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Converts `HH:MM` to minutes since midnight.
 * @param {string} slot
 * @returns {number | null}
 */
function slotToMinutes(slot) {
  const normalized = normalizeTimeSlot(slot);
  if (!normalized) return null;
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converts minutes since midnight to `HH:MM`.
 * @param {number} mins
 * @returns {string}
 */
function minutesToSlot(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Maps a PT-BR weekday name to index 0=Sun..6=Sat.
 * @param {string} dayName
 * @returns {number | null}
 */
function workingDayIndex(dayName) {
  const n = stripAccents(dayName);
  if (n.startsWith('dom')) return 0;
  if (n.startsWith('seg')) return 1;
  if (n.startsWith('ter')) return 2;
  if (n.startsWith('qua')) return 3;
  if (n.startsWith('qui')) return 4;
  if (n.startsWith('sex')) return 5;
  if (n.startsWith('sab')) return 6;
  return null;
}

/**
 * Parses PT-BR spoken/written time expressions into `HH:MM`.
 * @param {string} text
 * @returns {string | null}
 */
function parseTimeSlot(text) {
  const t = String(text || '').toLowerCase();
  const n = stripAccents(t);
  let timeSlot = null;

  const toPeriodAdjusted = (hour, periodRaw) => {
    let hh = Number(hour);
    const period = stripAccents(periodRaw || '');
    if ((period === 'tarde' || period === 'noite') && hh > 0 && hh < 12) hh += 12;
    if (period === 'manha' && hh === 12) hh = 0;
    if (hh < 0 || hh > 23) return null;
    return hh;
  };

  if (/meio.?dia/i.test(t)) return '12:00';
  if (/meia.?noite/i.test(t)) return '00:00';

  let tm = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (tm) {
    const hh = parseInt(tm[1], 10);
    const mm = parseInt(tm[2], 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      timeSlot = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  if (!timeSlot) {
    tm = t.match(/\b(\d{1,2})\s*h\s*(\d{2})?\s*(?:da\s*(manh[aã]|tarde|noite))?/i);
    if (tm) {
      const hh = tm[3] ? toPeriodAdjusted(tm[1], tm[3]) : parseInt(tm[1], 10);
      const mm = tm[2] ? parseInt(tm[2], 10) : 0;
      if (hh != null && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        timeSlot = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
    }
  }

  if (!timeSlot) {
    tm = t.match(
      /(?:[aà]s?\s*)?(\d{1,2})\s*(?:h(?:oras?)?)?\s*(?:da\s*(manh[aã]|tarde|noite))?/i
    );
    if (
      tm &&
      /\d/.test(tm[0]) &&
      (/\bhoras?\b|[aà]s\b|\bh\b|da\s*(manh|tarde|noite)/i.test(tm[0]) ||
        /[aà]s\s*\d/.test(t))
    ) {
      const hh = toPeriodAdjusted(tm[1], tm[2]);
      if (hh != null) timeSlot = `${String(hh).padStart(2, '0')}:00`;
    }
  }

  if (!timeSlot) {
    const words = Object.keys(HOUR_WORDS).join('|');
    const wordRe = new RegExp(
      `\\b(${words})\\b\\s*(?:horas?)?\\s*(?:da\\s*(manh[aã]|tarde|noite))?`,
      'i'
    );
    const wm = n.match(wordRe);
    if (wm) {
      const base = HOUR_WORDS[stripAccents(wm[1])] || HOUR_WORDS[wm[1]];
      if (base) {
        const hh = toPeriodAdjusted(base, wm[2]);
        if (hh != null) timeSlot = `${String(hh).padStart(2, '0')}:00`;
      }
    }
  }

  if (!timeSlot) {
    if (/\b(de\s+)?manh[aã]\b/i.test(t)) timeSlot = '09:00';
    else if (/\b(a|à)?\s*tarde\b/i.test(t)) timeSlot = '14:00';
    else if (/\b(a|à)?\s*noite\b/i.test(t)) timeSlot = '19:00';
  }

  return timeSlot ? normalizeTimeSlot(timeSlot) : null;
}

/**
 * Parses ISO or PT-BR natural date expressions into `YYYY-MM-DD`.
 * @param {string} text
 * @param {string} [refDateStr]
 * @returns {string | null}
 */
function parseDateStr(text, refDateStr) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;

  const isoMatch = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return isoMatch[0];
    }
  }

  const n = stripAccents(t);
  const today = refDateStr || nowSP().dateStr;

  if (/depois\s+de\s+amanh[aã]|depois\s+amanh[aã]/i.test(t)) return addDays(today, 2);
  if (/amanh[aã]/i.test(t)) return addDays(today, 1);
  if (/\bhoje\b/i.test(t)) return today;

  for (const [name, idx] of Object.entries(WEEKDAYS_SHORT)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(n)) {
      const cur = weekdayIndex(today);
      let delta = (idx - cur + 7) % 7;
      if (delta === 0 && !/\bhoje\b/i.test(t)) delta = 7;
      if (/\bpr[oó]xim[ao]\b/i.test(t) && delta === 0) delta = 7;
      return addDays(today, delta);
    }
  }

  const dm = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (dm) {
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10);
    let year = dm[3] ? parseInt(dm[3], 10) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dOnly = t.match(/\bdia\s+(\d{1,2})\b/i);
  if (dOnly) {
    const day = parseInt(dOnly[1], 10);
    const [y, m, td] = today.split('-').map(Number);
    let year = y;
    let month = m;
    if (day < td && td - day > 2) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    if (day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  if (/(pr[oó]ximo\s+dia|pr[oó]xima\s+data)/i.test(t)) return addDays(today, 1);

  return null;
}

/**
 * Extracts `{ dateStr, timeSlot, today, todayFriendly }` from natural PT-BR text.
 * @param {string} text
 * @param {string} [refDateStr]
 */
function extractDateTime(text, refDateStr) {
  const today = refDateStr || nowSP().dateStr;
  return {
    dateStr: parseDateStr(text, today),
    timeSlot: parseTimeSlot(text),
    today,
    todayFriendly: formatFriendly(today, null),
  };
}

/**
 * Normalizes Brazilian Portuguese regionalisms and colloquial booking/order phrases.
 */
class RegionalNormalizer {
  /**
   * @param {string} text
   * @returns {{ text: string, original: string, regionalHits: string[] }}
   */
  normalize(text) {
    const original = String(text || '');
    let result = original;
    const regionalHits = [];

    for (const [re, replacement] of REGIONAL_MAP) {
      if (re.test(result)) {
        regionalHits.push(re.source.slice(0, 40));
        result = result.replace(re, replacement);
      }
      re.lastIndex = 0;
    }

    result = result.replace(/\s+/g, ' ').trim();
    return { text: result, original, regionalHits };
  }
}

RegionalNormalizer.DomainError = DomainError;
RegionalNormalizer.TZ = TZ;
RegionalNormalizer.WEEKDAYS_PT = WEEKDAYS_PT;
RegionalNormalizer.MONTHS_PT = MONTHS_PT;
RegionalNormalizer.stripAccents = stripAccents;
RegionalNormalizer.formatPriceCents = formatPriceCents;
RegionalNormalizer.formatBrazilianPhone = formatBrazilianPhone;
RegionalNormalizer.weekdayIndex = weekdayIndex;
RegionalNormalizer.nowSP = nowSP;
RegionalNormalizer.addDays = addDays;
RegionalNormalizer.buildRollingCalendarSP = buildRollingCalendarSP;
RegionalNormalizer.formatFriendly = formatFriendly;
RegionalNormalizer.normalizeTimeSlot = normalizeTimeSlot;
RegionalNormalizer.slotToMinutes = slotToMinutes;
RegionalNormalizer.minutesToSlot = minutesToSlot;
RegionalNormalizer.workingDayIndex = workingDayIndex;
RegionalNormalizer.parseTimeSlot = parseTimeSlot;
RegionalNormalizer.parseDateStr = parseDateStr;
RegionalNormalizer.extractDateTime = extractDateTime;

module.exports = {
  RegionalNormalizer,
  DomainError,
  TZ,
  WEEKDAYS_PT,
  MONTHS_PT,
  stripAccents,
  formatPriceCents,
  formatBrazilianPhone,
  weekdayIndex,
  nowSP,
  addDays,
  buildRollingCalendarSP,
  formatFriendly,
  normalizeTimeSlot,
  slotToMinutes,
  minutesToSlot,
  workingDayIndex,
  parseTimeSlot,
  parseDateStr,
  extractDateTime,
};
