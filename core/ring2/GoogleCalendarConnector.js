'use strict';

/**
 * GoogleCalendarConnector — Integração com Google Calendar API v3
 * list / create / update / cancel.
 * Sem accessToken → status e reason NEED_OAUTH.
 */

const DEFAULT_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Google Calendar API timeout after ${timeoutMs}ms`);
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function parseLocalIso(str) {
  if (typeof str !== 'string') return null;
  // Casamento para YYYY-MM-DDTHH:mm ou YYYY-MM-DDTHH:mm:ss
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10) - 1,
    day: parseInt(m[3], 10),
    hour: parseInt(m[4], 10),
    minute: parseInt(m[5], 10),
    second: m[6] ? parseInt(m[6], 10) : 0
  };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatLocalIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function computeEndLocal(startStr, durationMinutes = 30) {
  const comp = parseLocalIso(startStr);
  if (comp) {
    const d = new Date(comp.year, comp.month, comp.day, comp.hour, comp.minute, comp.second);
    d.setMinutes(d.getMinutes() + (Number(durationMinutes) || 30));
    return formatLocalIso(d);
  }
  const ms = Date.parse(startStr);
  if (isNaN(ms)) return null;
  const d = new Date(ms + (Number(durationMinutes) || 30) * 60000);
  return d.toISOString();
}

function mapGoogleApiError(status, data) {
  const apiMessage = data?.error?.message || `HTTP ${status}`;
  let reason = data?.error?.status || 'API_ERROR';
  if (status === 401) {
    reason = 'TOKEN_EXPIRED';
  } else if (status === 403) {
    reason = 'FORBIDDEN';
  } else if (status === 404) {
    reason = 'NOT_FOUND';
  } else if (status === 429) {
    reason = 'RATE_LIMITED';
  } else if (status === 400) {
    reason = data?.error?.status || 'INVALID_REQUEST';
  }
  return {
    ok: false,
    status: (status === 401 || status === 403) ? 'NEED_OAUTH' : 'ERROR',
    httpStatus: status,
    reason,
    message: apiMessage
  };
}

class GoogleCalendarConnector {
  static async handleIntent(intent, accessToken, payload = {}) {
    const structured = await this.dispatch(intent, accessToken, payload);
    if (structured.markdown) return structured.markdown;
    if (!structured.ok) {
      return `\n\n### 📅 GOOGLE CALENDAR\n- **Status:** ⚠️ ${structured.reason || 'ERROR'}\n- **Motivo:** ${structured.message || ''}`;
    }
    return structured.markdown || JSON.stringify(structured);
  }

  static async dispatch(intent, accessToken, payload = {}) {
    if (!accessToken) {
      return {
        ok: false,
        status: 'NEED_OAUTH',
        reason: 'NEED_OAUTH',
        message:
          'Sem permissão Google Calendar (OAuth). Peça ao utilizador para ligar a conta Google; não criei/alterei eventos.'
      };
    }
    try {
      switch (String(intent || '').toUpperCase()) {
        case 'CONSULTAR_AGENDA':
        case 'LIST':
        case 'CALENDAR_LIST':
          return await this._list(accessToken, payload);
        case 'CRIAR_COMPROMISSO':
        case 'CREATE':
        case 'CALENDAR_CREATE':
          return await this._create(accessToken, payload);
        case 'ALTERAR_COMPROMISSO':
        case 'UPDATE':
        case 'CALENDAR_UPDATE':
          return await this._update(accessToken, payload);
        case 'CANCELAR_COMPROMISSO':
        case 'CANCEL':
        case 'DELETE':
        case 'CALENDAR_CANCEL':
          return await this._cancel(accessToken, payload);
        default:
          return { ok: false, status: 'ERROR', reason: 'UNKNOWN_INTENT', message: String(intent) };
      }
    } catch (error) {
      if (error.isTimeout) {
        return { ok: false, status: 'ERROR', reason: 'TIMEOUT', message: error.message };
      }
      return { ok: false, status: 'ERROR', reason: 'API_ERROR', message: error.message };
    }
  }

  static async _list(accessToken, payload = {}) {
    const timeMin = payload.timeMin || new Date().toISOString();
    const maxResults = Math.min(20, parseInt(payload.maxResults, 10) || 5);
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || (data && data.error)) {
      return mapGoogleApiError(res.status, data);
    }
    const events = (data.items || []).map((ev) => ({
      id: ev.id,
      summary: ev.summary || 'Sem título',
      start: (ev.start && (ev.start.dateTime || ev.start.date)) || null,
      end: (ev.end && (ev.end.dateTime || ev.end.date)) || null,
      htmlLink: ev.htmlLink || null
    }));
    let md = '\n\n### 📅 Google Calendar — próximos eventos\n';
    if (!events.length) md += '- Nenhum evento futuro encontrado.\n';
    else events.forEach((ev) => { md += `- **${ev.summary}** (${ev.start}) id=\`${ev.id}\`\n`; });
    return { ok: true, status: 'SUCCESS', events, markdown: md };
  }

  static async _create(accessToken, payload = {}) {
    const timeZone = payload.timeZone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Sao_Paulo';
    let rawStart = payload.start || payload.startDateTime;

    if (!rawStart) {
      rawStart = formatLocalIso(new Date());
    }

    if (isNaN(Date.parse(rawStart))) {
      return {
        ok: false,
        status: 'ERROR',
        reason: 'INVALID_START',
        message: `Data/hora inicial inválida: ${rawStart}`
      };
    }

    // Calcula end de forma coerente preservando formato local ou ISO
    let rawEnd = payload.end || payload.endDateTime;
    if (!rawEnd) {
      rawEnd = computeEndLocal(rawStart, payload.durationMinutes || 30);
    }

    if (!rawEnd || isNaN(Date.parse(rawEnd))) {
      return {
        ok: false,
        status: 'ERROR',
        reason: 'INVALID_END',
        message: `Data/hora final inválida: ${rawEnd}`
      };
    }

    // Validação estrita: end deve ser maior que start
    const startComp = parseLocalIso(rawStart);
    const endComp = parseLocalIso(rawEnd);
    if (startComp && endComp) {
      const dStart = new Date(startComp.year, startComp.month, startComp.day, startComp.hour, startComp.minute, startComp.second);
      const dEnd = new Date(endComp.year, endComp.month, endComp.day, endComp.hour, endComp.minute, endComp.second);
      if (dEnd.getTime() <= dStart.getTime()) {
        return {
          ok: false,
          status: 'ERROR',
          reason: 'INVALID_INTERVAL',
          message: `Data final (${rawEnd}) deve ser maior que data inicial (${rawStart})`
        };
      }
    } else if (Date.parse(rawEnd) <= Date.parse(rawStart)) {
      return {
        ok: false,
        status: 'ERROR',
        reason: 'INVALID_INTERVAL',
        message: `Data final (${rawEnd}) deve ser maior que data inicial (${rawStart})`
      };
    }

    const event = {
      summary: payload.summary || payload.title || 'Compromisso Autonmax',
      description: payload.description || '',
      start: { dateTime: rawStart, timeZone },
      end: { dateTime: rawEnd, timeZone }
    };

    if (payload.remindersMinutes != null) {
      event.reminders = {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: Number(payload.remindersMinutes) || 30 }]
      };
    }

    const res = await fetchWithTimeout('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });

    let data = null;
    try { data = await res.json(); } catch (_) {}

    if (!res.ok || (data && data.error)) {
      return mapGoogleApiError(res.status, data);
    }

    return {
      ok: true,
      status: 'SUCCESS',
      eventId: data.id,
      event: { id: data.id, summary: data.summary, start: data.start, end: data.end, htmlLink: data.htmlLink },
      markdown: `\n\n### 📅 Evento criado\n- **${data.summary}**\n- Início: ${data.start && (data.start.dateTime || data.start.date)}\n- [Abrir](${data.htmlLink})\n`
    };
  }

  static async _update(accessToken, payload = {}) {
    const eventId = payload.eventId || payload.id;
    if (!eventId) {
      return { ok: false, status: 'ERROR', reason: 'NEED_EVENT_ID', message: 'Informe eventId do compromisso a alterar.' };
    }
    const timeZone = payload.timeZone || process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Sao_Paulo';
    const patch = {};
    if (payload.summary || payload.title) patch.summary = payload.summary || payload.title;
    if (payload.description != null) patch.description = payload.description;
    if (payload.start || payload.startDateTime) {
      const startStr = payload.start || payload.startDateTime;
      patch.start = { dateTime: startStr, timeZone };
    }
    if (payload.end || payload.endDateTime) {
      const endStr = payload.end || payload.endDateTime;
      patch.end = { dateTime: endStr, timeZone };
    }
    if (!Object.keys(patch).length) {
      return { ok: false, status: 'ERROR', reason: 'EMPTY_PATCH', message: 'Nada para alterar.' };
    }
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      }
    );
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || (data && data.error)) {
      return mapGoogleApiError(res.status, data);
    }
    return {
      ok: true,
      status: 'SUCCESS',
      eventId: data.id,
      event: { id: data.id, summary: data.summary, start: data.start, end: data.end, htmlLink: data.htmlLink },
      markdown: `\n\n### 📅 Evento atualizado\n- **${data.summary}** (\`${data.id}\`)\n`
    };
  }

  static async _cancel(accessToken, payload = {}) {
    const eventId = payload.eventId || payload.id;
    if (!eventId) {
      return { ok: false, status: 'ERROR', reason: 'NEED_EVENT_ID', message: 'Informe eventId do compromisso a cancelar.' };
    }
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.status === 204 || res.status === 200 || res.status === 410) {
      return {
        ok: true,
        status: 'SUCCESS',
        cancelled: true,
        eventId,
        alreadyGone: res.status === 410,
        markdown: `\n\n### 📅 Evento cancelado\n- id=\`${eventId}\`\n`
      };
    }
    let data = null;
    try { data = await res.json(); } catch (_) {}
    return mapGoogleApiError(res.status, data);
  }
}

module.exports = GoogleCalendarConnector;
