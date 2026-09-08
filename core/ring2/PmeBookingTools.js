'use strict';

/**
 * PmeBookingTools — agenda PME precisa e resiliente
 * - Slots reais a partir de workingHours + duração do serviço + conflitos
 * - Catálogo do painel (nome canónico + tag/id)
 * - Registro completo, sem dados desencontrados
 * - Max confirma sozinho (nunca "equipe humana")
 */

const fs = require('node:fs');
const path = require('node:path');
const BookingDateTime = require('./BookingDateTime');

const _memLocks = new Set();
let _sharedRuntime = null;
let _sharedConfigurator = null;

const DEFAULT_SLOT_STEP_MIN = 30;
const SLOT_LOCK_DIR = path.join(__dirname, '../../workspace/slot_locks');
const SLOT_LOCK_TTL_MS = 15 * 1000;

function _ensureLockDir() {
  try {
    if (!fs.existsSync(SLOT_LOCK_DIR)) fs.mkdirSync(SLOT_LOCK_DIR, { recursive: true });
  } catch (_) {}
}

function _lockFilePath(lockKey) {
  const safe = String(lockKey).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return path.join(SLOT_LOCK_DIR, `${safe}.lock`);
}

/** Lock de slot em disco (sobrevive a restart curto / evita double-book) */
function acquireDiskLock(lockKey) {
  _ensureLockDir();
  const fp = _lockFilePath(lockKey);
  try {
    if (fs.existsSync(fp)) {
      const st = fs.statSync(fp);
      if (Date.now() - st.mtimeMs < SLOT_LOCK_TTL_MS) return false;
      try {
        fs.unlinkSync(fp);
      } catch (_) {}
    }
    fs.writeFileSync(fp, JSON.stringify({ ts: Date.now(), key: lockKey }), { flag: 'wx' });
    return true;
  } catch (_) {
    // EEXIST ou corrida
    try {
      if (fs.existsSync(fp)) {
        const st = fs.statSync(fp);
        if (Date.now() - st.mtimeMs < SLOT_LOCK_TTL_MS) return false;
      }
    } catch (_) {}
    return false;
  }
}

function releaseDiskLock(lockKey) {
  try {
    const fp = _lockFilePath(lockKey);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (_) {}
}

class PmeBookingTools {
  static setRuntime(runtime) {
    _sharedRuntime = runtime;
  }

  static setConfigurator(configurator) {
    _sharedConfigurator = configurator;
  }

  static _config(partnerId) {
    if (!_sharedConfigurator) return null;
    return _sharedConfigurator.getAttendantConfig(partnerId);
  }

  static _norm(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Resolve serviço no catálogo do painel PME.
   * Retorna registro canónico com tag estável.
   */
  static resolveService(catalog, serviceName, serviceId) {
    const list = Array.isArray(catalog) ? catalog : [];
    if (!list.length) return null;

    if (serviceId) {
      const byId = list.find(
        (c) =>
          String(c.id || '') === String(serviceId) ||
          String(c.tag || '') === String(serviceId) ||
          String(c.serviceId || '') === String(serviceId)
      );
      if (byId) return this._serviceRecord(byId);
    }

    if (!serviceName) return null;
    const t = this._norm(serviceName);

    let hit =
      list.find((c) => this._norm(c.name) === t) ||
      list.find((c) => this._norm(c.name).includes(t) || t.includes(this._norm(c.name))) ||
      list.find((c) => {
        const tags = [].concat(c.tags || [], c.tag || [], c.aliases || []);
        return tags.some((x) => this._norm(x) === t || this._norm(x).includes(t));
      });

    return hit ? this._serviceRecord(hit) : null;
  }

  static _serviceRecord(svc) {
    const name = String(svc.name || '').trim();
    const tag =
      svc.tag ||
      svc.id ||
      svc.serviceId ||
      `svc_${this._norm(name).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}`;
    let priceCents = svc.priceCents;
    if (priceCents == null && svc.priceLabel) {
      const m = String(svc.priceLabel).replace(/\./g, '').match(/(\d+)(?:[,.](\d{1,2}))?/);
      if (m) {
        priceCents = parseInt(m[1], 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
      }
    }
    if (priceCents == null && typeof svc.price === 'number') {
      priceCents = Math.round(svc.price * 100);
    }
    const priceLabel =
      svc.priceLabel ||
      (priceCents != null ? `R$ ${(priceCents / 100).toFixed(2).replace('.', ',')}` : null);
    return {
      id: svc.id || tag,
      tag,
      name,
      description: svc.description || '',
      durationMinutes: Number(svc.durationMinutes) > 0 ? Number(svc.durationMinutes) : 30,
      priceCents: priceCents != null ? Number(priceCents) : null,
      priceLabel
    };
  }

  static _workingWindow(config, dateStr) {
    const hours = (config && (config.workingHours || config.businessHours)) || {
      days: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'],
      startTime: '09:00',
      endTime: '18:00'
    };
    const wd = BookingDateTime.weekdayIndex(dateStr);
    const days = hours.days || hours.weekDays || [];
    const allowed = days
      .map((d) => BookingDateTime.workingDayIndex(d))
      .filter((x) => x != null);
    if (allowed.length && !allowed.includes(wd)) {
      return { open: false, reason: 'CLOSED_DAY', weekday: BookingDateTime.WEEKDAYS_PT[wd] };
    }
    const start = BookingDateTime.normalizeTimeSlot(hours.startTime || '09:00') || '09:00';
    const end = BookingDateTime.normalizeTimeSlot(hours.endTime || '18:00') || '18:00';
    return {
      open: true,
      start,
      end,
      startMin: BookingDateTime.slotToMinutes(start),
      endMin: BookingDateTime.slotToMinutes(end),
      weekday: BookingDateTime.WEEKDAYS_PT[wd]
    };
  }

  static _busyIntervals(config, dateStr, durationMinutes) {
    const list = (config && (config.existingAppointments || config.appointments)) || [];
    const intervals = [];
    for (const ap of list) {
      if (!ap || ap.status === 'CANCELLED' || ap.status === 'canceled') continue;
      if (String(ap.dateStr) !== String(dateStr)) continue;
      const start = BookingDateTime.slotToMinutes(ap.timeSlot);
      if (start == null) continue;
      const dur = Number(ap.durationMinutes) > 0 ? Number(ap.durationMinutes) : durationMinutes || 30;
      intervals.push({ start, end: start + dur, appointmentId: ap.appointmentId || ap.id });
    }
    return intervals.sort((a, b) => a.start - b.start);
  }

  static _overlaps(startMin, endMin, busy) {
    return busy.some((b) => startMin < b.end && endMin > b.start);
  }

  /**
   * Horários livres reais para uma data.
   * Considera expediente, duração do serviço e agendamentos existentes.
   */
  static getAvailableSlots(args = {}) {
    const partnerId = args.partnerId;
    let dateStr = args.dateStr || BookingDateTime.nowSP().dateStr;
    dateStr = String(dateStr).slice(0, 10);

    const config = this._config(partnerId);
    const catalog = (config && config.catalog) || [];
    const svc = this.resolveService(catalog, args.serviceName, args.serviceId);
    const durationMinutes = svc
      ? svc.durationMinutes
      : Number(args.durationMinutes) > 0
        ? Number(args.durationMinutes)
        : 30;

    const window = this._workingWindow(config, dateStr);
    if (!window.open) {
      return {
        status: 'SUCCESS',
        ok: true,
        partnerId,
        dateStr,
        dateFriendly: BookingDateTime.formatFriendly(dateStr, null),
        slots: [],
        next: null,
        totalFree: 0,
        durationMinutes,
        service: svc,
        closed: true,
        reason: window.reason,
        message: `Fechado em ${BookingDateTime.formatFriendly(dateStr, null)} (${window.weekday}).`
      };
    }

    const busy = this._busyIntervals(config, dateStr, durationMinutes);
    // Locks em memória (reserva em andamento)
    for (const key of _memLocks) {
      if (key.startsWith(`${partnerId}_${dateStr}_`)) {
        const slot = key.split('_').pop();
        const sm = BookingDateTime.slotToMinutes(slot);
        if (sm != null) busy.push({ start: sm, end: sm + durationMinutes, appointmentId: 'lock' });
      }
    }

    const step = DEFAULT_SLOT_STEP_MIN;
    const slots = [];
    for (let t = window.startMin; t + durationMinutes <= window.endMin; t += step) {
      if (this._overlaps(t, t + durationMinutes, busy)) continue;
      // Se a data é hoje, não oferecer horários já passados
      const today = BookingDateTime.nowSP();
      if (dateStr === today.dateStr) {
        const nowMin = today.hh * 60 + today.mm;
        if (t < nowMin + 15) continue; // margem 15 min
      }
      const timeSlot = BookingDateTime.minutesToSlot(t);
      slots.push({
        timeSlot,
        endTimeSlot: BookingDateTime.minutesToSlot(t + durationMinutes),
        durationMinutes
      });
    }

    return {
      status: 'SUCCESS',
      ok: true,
      partnerId,
      dateStr,
      dateFriendly: BookingDateTime.formatFriendly(dateStr, null),
      slots,
      next: slots[0] || null,
      totalFree: slots.length,
      durationMinutes,
      service: svc,
      workingHours: { start: window.start, end: window.end, weekday: window.weekday },
      message:
        slots.length === 0
          ? `Sem horários livres em ${BookingDateTime.formatFriendly(dateStr, null)}.`
          : `${slots.length} horário(s) livre(s) em ${BookingDateTime.formatFriendly(dateStr, null)}. Próximo: ${slots[0].timeSlot}.`
    };
  }

  /**
   * Procura o próximo dia com vaga (até 21 dias).
   */
  static findNextOpenSlot(args = {}) {
    const partnerId = args.partnerId;
    let cursor = args.dateStr || BookingDateTime.nowSP().dateStr;
    const maxDays = Number(args.maxDays) > 0 ? Number(args.maxDays) : 21;
    for (let i = 0; i < maxDays; i++) {
      const day = BookingDateTime.addDays(cursor, i === 0 ? 0 : 1);
      if (i > 0) cursor = day;
      const res = this.getAvailableSlots({
        partnerId,
        dateStr: cursor,
        serviceName: args.serviceName,
        serviceId: args.serviceId,
        durationMinutes: args.durationMinutes
      });
      if (res.ok && res.slots && res.slots.length) {
        return {
          ok: true,
          dateStr: cursor,
          dateFriendly: BookingDateTime.formatFriendly(cursor, null),
          next: res.slots[0],
          totalFree: res.totalFree,
          durationMinutes: res.durationMinutes,
          service: res.service,
          message: `Próxima vaga: ${BookingDateTime.formatFriendly(cursor, res.slots[0].timeSlot)}.`
        };
      }
      cursor = day;
    }
    return {
      ok: false,
      message: 'Não encontrei horários livres nos próximos dias.'
    };
  }

  /**
   * Cria agendamento com registro completo e canónico.
   */
  static async createAppointment(args = {}) {
    const partnerId = args.partnerId;
    let clientName = String(args.clientName || '').trim();
    let serviceName = String(args.serviceName || '').trim();
    let dateStr = args.dateStr ? String(args.dateStr).slice(0, 10) : null;
    let timeSlot = BookingDateTime.normalizeTimeSlot(args.timeSlot);

    // --- VALIDAÇÃO FINAL (última linha de defesa) ---
    if (!clientName || clientName.startsWith('usr_') || clientName.startsWith('usr_nat_')) {
      clientName = 'Cliente';
    }

    if (!serviceName || serviceName.length < 3) {
      throw new Error(`[PME_BOOKING] serviceName inválido: "${serviceName}"`);
    }

    if (!partnerId) {
      return { ok: false, status: 'ERROR', message: 'partnerId obrigatório' };
    }

    // Normaliza data relativa se vier texto residual
    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      dateStr = BookingDateTime.parseDateStr(dateStr) || null;
    }
    if (!timeSlot && args.timeSlot) {
      timeSlot = BookingDateTime.parseTimeSlot(String(args.timeSlot));
    }

    if (!clientName || !serviceName || !dateStr || !timeSlot) {
      return {
        ok: false,
        status: 'ERROR',
        message: 'Parâmetros incompletos para agendar',
        missing: [
          !clientName && 'clientName',
          !serviceName && 'serviceName',
          !dateStr && 'dateStr',
          !timeSlot && 'timeSlot'
        ].filter(Boolean)
      };
    }

    const config = this._config(partnerId);
    const catalog = (config && config.catalog) || [];
    const svc = this.resolveService(catalog, serviceName, args.serviceId);

    // Hard fail: se o painel tem catálogo, o serviço DEVE existir (não inventar)
    if (catalog.length > 0 && !svc) {
      return {
        ok: false,
        status: 'ERROR',
        reason: 'CATALOG_MISS',
        message: `Serviço "${serviceName}" não encontrado no catálogo do estabelecimento.`,
        available: catalog.map((c) => c.name).filter(Boolean).slice(0, 12)
      };
    }

    // Sem catálogo: agenda com nome informado (sem inventar preço)
    const canonicalName = svc ? svc.name : serviceName;
    const durationMinutes = svc
      ? svc.durationMinutes
      : Number(args.durationMinutes) > 0
        ? Number(args.durationMinutes)
        : 30;
    const serviceTag = svc ? svc.tag : `svc_${this._norm(canonicalName).replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`;
    const priceCents = svc ? svc.priceCents : args.priceCents != null ? Number(args.priceCents) : null;
    const priceLabel = svc ? svc.priceLabel : args.priceLabel || null;

    // Valida expediente
    const window = this._workingWindow(config, dateStr);
    if (!window.open) {
      return {
        ok: false,
        status: 'ERROR',
        reason: 'CLOSED_DAY',
        message: `O estabelecimento não atende em ${BookingDateTime.formatFriendly(dateStr, null)}.`
      };
    }

    const startMin = BookingDateTime.slotToMinutes(timeSlot);
    const endMin = startMin + durationMinutes;
    if (startMin < window.startMin || endMin > window.endMin) {
      return {
        ok: false,
        status: 'ERROR',
        reason: 'OUTSIDE_HOURS',
        message: `Horário fora do expediente (${window.start}–${window.end}).`
      };
    }

    const lockKey = `${partnerId}_${dateStr}_${timeSlot}`;
    const force = !!args.force;

    if (!force && _memLocks.has(lockKey)) {
      return {
        ok: false,
        status: 'ERROR',
        reason: 'SLOT_LOCKED',
        message: 'Este horário está sendo reservado neste momento. Escolha outro, por favor.'
      };
    }

    if (!force && !acquireDiskLock(lockKey)) {
      return {
        ok: false,
        status: 'ERROR',
        reason: 'SLOT_LOCKED',
        message: 'Este horário está sendo reservado neste momento. Escolha outro, por favor.'
      };
    }

    // Conflito real na agenda (re-lê config fresca após lock)
    const configFresh = this._config(partnerId) || config;
    const busy = this._busyIntervals(configFresh, dateStr, durationMinutes);
    if (!force && this._overlaps(startMin, endMin, busy)) {
      releaseDiskLock(lockKey);
      const alt = this.getAvailableSlots({
        partnerId,
        dateStr,
        serviceName: canonicalName,
        serviceId: svc && svc.id
      });
      return {
        ok: false,
        status: 'ERROR',
        reason: 'SLOT_TAKEN',
        message: `O horário ${timeSlot} em ${BookingDateTime.formatFriendly(dateStr, null)} já está ocupado.`,
        alternatives: (alt.slots || []).slice(0, 5)
      };
    }

    _memLocks.add(lockKey);
    try {
      const appointmentId = `${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
      const appointmentRow = {
        appointmentId,
        partnerId,
        clientName,
        customerPhone: args.customerPhone || null,
        remoteJid: args.remoteJid || null,
        serviceName: canonicalName,
        serviceTag,
        serviceId: svc ? svc.id : null,
        dateStr,
        timeSlot,
        endTimeSlot: BookingDateTime.minutesToSlot(endMin),
        durationMinutes,
        priceCents,
        priceLabel,
        status: 'CONFIRMED',
        source: args.source || 'whatsapp',
        createdAt: new Date().toISOString(),
        dateFriendly: BookingDateTime.formatFriendly(dateStr, timeSlot)
      };

      if (_sharedConfigurator && configFresh) {
        if (!Array.isArray(configFresh.existingAppointments)) configFresh.existingAppointments = [];
        configFresh.existingAppointments.push(appointmentRow);
        if (configFresh.metricsHistory) {
          configFresh.metricsHistory.appointmentsCreated =
            (configFresh.metricsHistory.appointmentsCreated || 0) + 1;
        }
        configFresh.updatedAt = new Date().toISOString();
        if (typeof _sharedConfigurator.markDirty === 'function') {
          _sharedConfigurator.markDirty(partnerId);
        }
        // Flush imediato — não depender do debounce de 200ms
        if (typeof _sharedConfigurator.flush === 'function') {
          _sharedConfigurator.flush();
        } else {
          _sharedConfigurator.saveData();
        }
      }

      console.log(
        `[BOOKING_PERSIST] ${appointmentId} · ${canonicalName} · ${appointmentRow.dateFriendly} · ${clientName}`
      );

      try {
        const auditDir = path.join(__dirname, '../../workspace/booking_audit');
        if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
        fs.appendFileSync(
          path.join(auditDir, `${String(partnerId).replace(/[^a-zA-Z0-9_-]/g, '_')}.jsonl`),
          JSON.stringify(appointmentRow) + '\n'
        );
      } catch (_) {}

      return {
        ok: true,
        status: 'SUCCESS',
        message: `Agendamento confirmado: ${canonicalName} em ${appointmentRow.dateFriendly}.`,
        appointment: appointmentRow
      };
    } finally {
      setTimeout(() => {
        _memLocks.delete(lockKey);
        releaseDiskLock(lockKey);
      }, 2500);
    }
  }

  static async cancelAppointment(args = {}) {
    const { partnerId, clientName, dateStr, timeSlot, appointmentId } = args;
    if (!_sharedConfigurator) {
      return { ok: false, message: 'Configurador indisponível' };
    }
    const config = _sharedConfigurator.getAttendantConfig(partnerId);
    if (!config || !Array.isArray(config.existingAppointments)) {
      return { ok: false, message: 'Agendamento não encontrado' };
    }

    const idx = config.existingAppointments.findIndex((a) => {
      if (appointmentId && String(a.appointmentId || a.id) === String(appointmentId)) return true;
      if (
        dateStr &&
        timeSlot &&
        String(a.dateStr) === String(dateStr) &&
        String(a.timeSlot) === String(timeSlot)
      ) {
        if (clientName && a.clientName && this._norm(a.clientName) !== this._norm(clientName)) {
          return false;
        }
        return true;
      }
      return false;
    });

    if (idx < 0) return { ok: false, message: 'Agendamento não encontrado' };

    const removed = config.existingAppointments.splice(idx, 1)[0];
    removed.status = 'CANCELLED';
    removed.cancelledAt = new Date().toISOString();
    if (!Array.isArray(config.cancelledAppointments)) config.cancelledAppointments = [];
    config.cancelledAppointments.push(removed);
    // Limita histórico de cancelados
    if (config.cancelledAppointments.length > 200) {
      config.cancelledAppointments = config.cancelledAppointments.slice(-200);
    }
    config.updatedAt = new Date().toISOString();
    if (typeof _sharedConfigurator.markDirty === 'function') {
      _sharedConfigurator.markDirty(partnerId);
    }
    if (typeof _sharedConfigurator.flush === 'function') {
      _sharedConfigurator.flush();
    } else {
      _sharedConfigurator.saveData();
    }

    const lockKey = `${partnerId}_${removed.dateStr}_${removed.timeSlot}`;
    _memLocks.delete(lockKey);
    releaseDiskLock(lockKey);

    try {
      const auditDir = path.join(__dirname, '../../workspace/booking_audit');
      if (!fs.existsSync(auditDir)) fs.mkdirSync(auditDir, { recursive: true });
      fs.appendFileSync(
        path.join(auditDir, `${String(partnerId).replace(/[^a-zA-Z0-9_-]/g, '_')}.jsonl`),
        JSON.stringify({ event: 'cancel', ...removed }) + '\n'
      );
    } catch (_) {}

    return {
      ok: true,
      message: `Cancelado: ${removed.serviceName} em ${BookingDateTime.formatFriendly(removed.dateStr, removed.timeSlot)}.`,
      appointment: removed
    };
  }
}

module.exports = PmeBookingTools;
module.exports.DEFAULT_CATALOG = [];
