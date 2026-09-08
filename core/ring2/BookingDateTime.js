'use strict';

/**
 * BookingDateTime — calendário e horários em America/Sao_Paulo
 * Interpretação de fala natural (amanhã, de manhã às 9, terça, etc.)
 * Formatação legível em pt-BR para confirmação ao cliente.
 */

const TZ = 'America/Sao_Paulo';

const WEEKDAYS_PT = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado'
];

const WEEKDAYS_SHORT = {
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
  sab: 6
};

const MONTHS_PT = [
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
  'dezembro'
];

const HOUR_WORDS = {
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
  doze: 12
};

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Data/hora atuais em São Paulo (não UTC). */
function nowSP() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  }).formatToParts(new Date());
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  const hh = Number(get('hour') === '24' ? '0' : get('hour'));
  const mm = Number(get('minute'));
  const ss = Number(get('second'));
  // weekday from local calendar
  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const weekday = weekdayIndex(dateStr);
  return { y, m, d, hh, mm, ss, dateStr, weekday, timeSlot: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

function weekdayIndex(dateStr) {
  // Compute weekday via noon UTC offset-safe: use Date with explicit parts + SP offset approx
  const [y, m, d] = String(dateStr).split('-').map(Number);
  // Use Intl to get weekday name for that civil date in SP
  const probe = new Date(Date.UTC(y, m - 1, d, 15, 0, 0)); // ~noon SP
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(probe);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function formatFriendly(dateStr, timeSlot) {
  if (!dateStr) return timeSlot ? `às ${timeSlot}` : '';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const wd = WEEKDAYS_PT[weekdayIndex(dateStr)] || '';
  const month = MONTHS_PT[(m || 1) - 1] || '';
  const datePart = `${wd}, ${d} de ${month} de ${y}`;
  if (timeSlot) return `${datePart} às ${timeSlot}`;
  return datePart;
}

function todayInfo() {
  const n = nowSP();
  return {
    dateStr: n.dateStr,
    timeSlot: n.timeSlot,
    weekday: n.weekday,
    weekdayName: WEEKDAYS_PT[n.weekday],
    friendly: formatFriendly(n.dateStr, null),
    label: `hoje (${WEEKDAYS_PT[n.weekday]}, ${n.d}/${String(n.m).padStart(2, '0')}/${n.y})`
  };
}

function parseTimeSlot(text) {
  const t = String(text || '').toLowerCase();
  const n = norm(t);
  let timeSlot = null;

  const toPeriodAdjusted = (hour, periodRaw) => {
    let hh = Number(hour);
    const period = norm(periodRaw || '');
    if ((period === 'tarde' || period === 'noite') && hh > 0 && hh < 12) hh += 12;
    if (period === 'manha' && hh === 12) hh = 0;
    if (hh < 0 || hh > 23) return null;
    return hh;
  };

  // HH:MM
  let tm = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (tm) {
    const hh = Math.min(23, parseInt(tm[1], 10));
    const mm = Math.min(59, parseInt(tm[2], 10));
    timeSlot = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // HHh / HHhMM
  if (!timeSlot) {
    tm = t.match(/\b(\d{1,2})\s*h\s*(\d{2})?\b/i);
    if (tm) {
      timeSlot = `${String(parseInt(tm[1], 10)).padStart(2, '0')}:${tm[2] || '00'}`;
    }
  }

  // "às 9" / "as 9" / "9 horas" (com período opcional)
  if (!timeSlot) {
    tm = t.match(/(?:[aà]s?\s*)?(\d{1,2})\s*(?:h(?:oras?)?)?\s*(?:da\s*(manh[aã]|tarde|noite))?/i);
    if (tm && /\d/.test(tm[0]) && (/\bhoras?\b|[aà]s\b|\bh\b|da\s*(manh|tarde|noite)/i.test(tm[0]) || /[aà]s\s*\d/.test(t))) {
      const hh = toPeriodAdjusted(tm[1], tm[2]);
      if (hh != null) timeSlot = `${String(hh).padStart(2, '0')}:00`;
    }
  }

  // "5 da tarde" / "9 da manhã"
  if (!timeSlot) {
    tm = t.match(/\b(\d{1,2})\s*(?:h(?:oras?)?)?\s*da\s*(manh[aã]|tarde|noite)\b/i);
    if (tm) {
      const hh = toPeriodAdjusted(tm[1], tm[2]);
      if (hh != null) timeSlot = `${String(hh).padStart(2, '0')}:00`;
    }
  }

  // Extenso: "nove da manhã", "cinco da tarde"
  if (!timeSlot) {
    const words = Object.keys(HOUR_WORDS).join('|');
    const wordRe = new RegExp(`\\b(${words})\\b\\s*(?:horas?)?\\s*(?:da\\s*(manh[aã]|tarde|noite))?`, 'i');
    const wm = n.match(wordRe);
    if (wm) {
      const base = HOUR_WORDS[norm(wm[1])] || HOUR_WORDS[wm[1]];
      if (base) {
        const hh = toPeriodAdjusted(base, wm[2]);
        if (hh != null) timeSlot = `${String(hh).padStart(2, '0')}:00`;
      }
    }
  }

  // Período só ("de manhã" / "à tarde") → âncora padrão
  if (!timeSlot) {
    if (/\b(de\s+)?manh[aã]\b/i.test(t)) timeSlot = '09:00';
    else if (/\b(a|à)?\s*tarde\b/i.test(t)) timeSlot = '14:00';
    else if (/\b(a|à)?\s*noite\b/i.test(t)) timeSlot = '19:00';
  }

  if (/meio.?dia/i.test(t)) timeSlot = '12:00';
  if (/meia.?noite/i.test(t)) timeSlot = '00:00';

  // Normaliza range válido
  if (timeSlot) {
    const [h, m] = timeSlot.split(':').map(Number);
    if (Number.isNaN(h) || h < 0 || h > 23) return null;
    return `${String(h).padStart(2, '0')}:${String(Math.min(59, m || 0)).padStart(2, '0')}`;
  }
  return null;
}

function parseDateStr(text, refDateStr) {
  const t = String(text || '').toLowerCase();
  const n = norm(t);
  const today = refDateStr || nowSP().dateStr;

  if (/depois\s+de\s+amanh[aã]|depois\s+amanh[aã]/i.test(t)) return addDays(today, 2);
  if (/amanh[aã]/i.test(t)) return addDays(today, 1);
  if (/\bhoje\b/i.test(t)) return today;

  // Dia da semana: "segunda", "próxima terça"
  for (const [name, idx] of Object.entries(WEEKDAYS_SHORT)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(n)) {
      const cur = weekdayIndex(today);
      let delta = (idx - cur + 7) % 7;
      if (delta === 0 && !/\bhoje\b/i.test(t)) delta = 7; // "segunda" sem "hoje" → próxima
      if (/\bpr[oó]xim[ao]\b/i.test(t) && delta === 0) delta = 7;
      return addDays(today, delta);
    }
  }

  // dd/mm ou dd-mm
  let dm = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (dm) {
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10);
    let year = dm[3] ? parseInt(dm[3], 10) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // "dia 15"
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
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  if (/(pr[oó]ximo\s+dia|pr[oó]xima\s+data)/i.test(t)) return addDays(today, 1);

  return null;
}

/**
 * Extrai { dateStr, timeSlot } de fala natural.
 * Timezone: America/Sao_Paulo.
 */
function extractDateTime(text) {
  const today = nowSP().dateStr;
  const dateStr = parseDateStr(text, today);
  const timeSlot = parseTimeSlot(text);
  return { dateStr, timeSlot, today, todayFriendly: formatFriendly(today, null) };
}

/**
 * Garante HH:MM válido.
 */
function normalizeTimeSlot(slot) {
  if (!slot) return null;
  const m = String(slot).trim().match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2] || '0', 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Converte "09:00" → minutos desde meia-noite.
 */
function slotToMinutes(slot) {
  const n = normalizeTimeSlot(slot);
  if (!n) return null;
  const [h, m] = n.split(':').map(Number);
  return h * 60 + m;
}

function minutesToSlot(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Mapeia nome de dia PT → índice 0=dom…6=sáb
 */
function workingDayIndex(dayName) {
  const n = norm(dayName);
  if (n.startsWith('dom')) return 0;
  if (n.startsWith('seg')) return 1;
  if (n.startsWith('ter')) return 2;
  if (n.startsWith('qua')) return 3;
  if (n.startsWith('qui')) return 4;
  if (n.startsWith('sex')) return 5;
  if (n.startsWith('sab')) return 6;
  return null;
}

module.exports = {
  TZ,
  WEEKDAYS_PT,
  nowSP,
  todayInfo,
  addDays,
  formatFriendly,
  extractDateTime,
  parseDateStr,
  parseTimeSlot,
  normalizeTimeSlot,
  slotToMinutes,
  minutesToSlot,
  weekdayIndex,
  workingDayIndex
};
