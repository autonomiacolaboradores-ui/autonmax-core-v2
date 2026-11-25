'use strict';

const { DatabaseManager } = require('../storage/DatabaseManager');
const { AppointmentRepository } = require('../storage/repositories/AppointmentRepository');
const { CatalogRepository } = require('../storage/repositories/CatalogRepository');
const { PartnerRepository } = require('../storage/repositories/PartnerRepository');
const {
  DomainError,
  WEEKDAYS_PT,
  formatFriendly,
  formatPriceCents,
  minutesToSlot,
  normalizeTimeSlot,
  nowSP,
  parseDateStr,
  parseTimeSlot,
  slotToMinutes,
  weekdayIndex,
  workingDayIndex,
} = require('./RegionalNormalizer');

const DEFAULT_SLOT_STEP_MIN = 30;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolves the partner's configured working window for `dateStr`.
 * Supports Doc 02 `{ weekly: [{ dayOfWeek, open, close }] }` and legacy `{ days, startTime, endTime }`.
 * When `working_hours` is null/unset, defaults to open 08:00-20:00.
 * @param {Record<string, any> | null} partner
 * @param {string} dateStr
 */
function resolveWorkingWindow(partner, dateStr) {
  const wd = weekdayIndex(dateStr);
  const weekday = WEEKDAYS_PT[wd] || '';
  const wh = partner && (partner.working_hours || partner.business_hours);

  if (!wh) {
    return {
      configured: false,
      open: true,
      start: '08:00',
      end: '20:00',
      startMin: 8 * 60,
      endMin: 20 * 60,
      weekday,
    };
  }

  if (Array.isArray(wh.weekly)) {
    const dayRule = wh.weekly.find((entry) => Number(entry.dayOfWeek) === wd);
    if (!dayRule) {
      return { configured: true, open: false, reason: 'CLOSED_DAY', weekday };
    }
    const start = normalizeTimeSlot(dayRule.open || '09:00') || '09:00';
    const end = normalizeTimeSlot(dayRule.close || '18:00') || '18:00';
    return {
      configured: true,
      open: true,
      start,
      end,
      startMin: slotToMinutes(start),
      endMin: slotToMinutes(end),
      weekday,
    };
  }

  const days = wh.days || wh.weekDays || [];
  if (Array.isArray(days) && days.length > 0) {
    const allowed = days.map((d) => workingDayIndex(d)).filter((x) => x !== null);
    if (allowed.length > 0 && !allowed.includes(wd)) {
      return { configured: true, open: false, reason: 'CLOSED_DAY', weekday };
    }
  }

  const start = normalizeTimeSlot(wh.startTime || wh.open || '09:00') || '09:00';
  const end = normalizeTimeSlot(wh.endTime || wh.close || '18:00') || '18:00';
  return {
    configured: true,
    open: true,
    start,
    end,
    startMin: slotToMinutes(start),
    endMin: slotToMinutes(end),
    weekday,
  };
}

/**
 * Normalizes a date expression (`YYYY-MM-DD` or PT-BR) or throws DomainError.
 * @param {string} rawDate
 */
function requireDateStr(rawDate) {
  const s = String(rawDate || '').trim();
  const dateStr = ISO_DATE_RE.test(s) ? s.slice(0, 10) : parseDateStr(s);
  if (!dateStr || !ISO_DATE_RE.test(dateStr)) {
    throw new DomainError('VALIDATION_ERROR', `Data inválida: "${rawDate}".`, {
      dateStr: rawDate,
    });
  }
  return dateStr;
}

/**
 * Normalizes a time expression (`HH:MM` or PT-BR) or throws DomainError.
 * @param {string} rawTime
 */
function requireTimeSlot(rawTime) {
  const s = String(rawTime || '').trim();
  const timeSlot = normalizeTimeSlot(s) || parseTimeSlot(s);
  if (!timeSlot) {
    throw new DomainError('VALIDATION_ERROR', `Horário inválido: "${rawTime}".`, {
      timeSlot: rawTime,
    });
  }
  return timeSlot;
}

/**
 * Transactional service-booking domain engine implementing Elo 1 (SERVICE-only lock)
 * and Elo 2 (SQLite authoritative pricing/duration + BEGIN IMMEDIATE interval overlap lock).
 */
class BookingService {
  /**
   * @param {{
   *   dbManager: DatabaseManager,
   *   appointmentRepository?: AppointmentRepository,
   *   catalogRepository?: CatalogRepository,
   *   partnerRepository?: PartnerRepository
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.dbManager) {
      throw new Error('BookingService requires dbManager');
    }
    this.dbManager = deps.dbManager;
    this.appointmentRepository =
      deps.appointmentRepository || new AppointmentRepository(deps.dbManager);
    this.catalogRepository =
      deps.catalogRepository || new CatalogRepository(deps.dbManager);
    this.partnerRepository =
      deps.partnerRepository || new PartnerRepository(deps.dbManager);
    this.nowFn = typeof deps.nowFn === 'function' ? deps.nowFn : null;
  }

  /**
   * Returns current Sao Paulo date/time breakdown (injectable for deterministic tests).
   * @private
   */
  _nowSP() {
    return this.nowFn ? nowSP(this.nowFn()) : nowSP();
  }

  /**
   * Validates Elo 1: item belongs to partnerId, is active, and has item_type === 'SERVICE'.
   * @private
   */
  _requireServiceItem(partnerId, itemId, expectedVersionHash = null) {
    if (!itemId) {
      throw new DomainError('VALIDATION_ERROR', 'itemId é obrigatório.');
    }
    const item = this.catalogRepository.findById(itemId, { partnerId });
    if (!item) {
      throw new DomainError(
        'CATALOG_NOT_FOUND',
        `Serviço "${itemId}" não encontrado para este parceiro.`,
        { partnerId, itemId },
        404
      );
    }
    if (Number(item.active) !== 1) {
      throw new DomainError(
        'CATALOG_INACTIVE',
        `O serviço "${item.name}" está desativado.`,
        { partnerId, itemId },
        409
      );
    }
    if (item.item_type !== 'SERVICE') {
      throw new DomainError(
        'INVALID_ITEM_TYPE',
        `Não é possível agendar "${item.name}" porque é um item do tipo ${item.item_type}, e não SERVICE.`,
        { partnerId, itemId, itemType: item.item_type },
        400
      );
    }
    if (expectedVersionHash && expectedVersionHash !== item.version_hash) {
      throw new DomainError(
        'VERSION_MISMATCH',
        `O serviço "${item.name}" foi atualizado recentemente. Recarregue o catálogo antes de confirmar.`,
        { itemId, expectedVersionHash, actualVersionHash: item.version_hash },
        409
      );
    }
    return item;
  }

  /**
   * Checks free slots for a SERVICE item on a given date, accounting for
   * partner working hours, service duration, and confirmed interval overlaps.
   * @param {{ partnerId: string, itemId: string, dateStr: string, stepMinutes?: number, skipPastCheck?: boolean }} params
   */
  checkAvailableSlots({
    partnerId,
    itemId,
    dateStr: rawDateStr,
    stepMinutes = DEFAULT_SLOT_STEP_MIN,
    skipPastCheck = false,
  }) {
    if (!partnerId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId é obrigatório.');
    }

    const item = this._requireServiceItem(partnerId, itemId);
    const dateStr = requireDateStr(rawDateStr);
    const today = this._nowSP();
    const durationMinutes = Number(item.duration_minutes) || 30;

    if (!skipPastCheck && dateStr < today.dateStr) {
      return {
        ok: true,
        partnerId,
        itemId: item.id,
        serviceName: item.name,
        dateStr,
        dateFriendly: formatFriendly(dateStr),
        durationMinutes,
        closed: true,
        pastDate: true,
        reason: 'PAST_DATE_NOT_ALLOWED',
        message: `A data ${dateStr} já passou. Hoje em São Paulo é ${today.dateStr} (${today.timeSlot}). Informe uma data a partir de hoje.`,
        slots: [],
      };
    }

    const partner = this.partnerRepository.findById(partnerId);
    const window = resolveWorkingWindow(partner, dateStr);

    if (!window.open) {
      return {
        ok: true,
        partnerId,
        itemId: item.id,
        dateStr,
        dateFriendly: formatFriendly(dateStr),
        durationMinutes,
        closed: true,
        reason: window.reason,
        slots: [],
      };
    }

    const confirmed = this.appointmentRepository.listByPartnerAndDate(
      partnerId,
      dateStr,
      { status: 'CONFIRMED' }
    );
    const busy = confirmed
      .map((ap) => {
        const start = slotToMinutes(ap.time_slot);
        if (start === null) return null;
        const dur = Number(ap.duration_minutes_snapshot) || 30;
        return { start, end: start + dur, id: ap.id };
      })
      .filter(Boolean);

    const step = Number.isInteger(stepMinutes) && stepMinutes > 0 ? stepMinutes : DEFAULT_SLOT_STEP_MIN;
    const slots = [];

    for (let t = window.startMin; t + durationMinutes <= window.endMin; t += step) {
      const end = t + durationMinutes;
      const overlaps = busy.some((b) => t < b.end && end > b.start);
      if (overlaps) continue;

      if (!skipPastCheck && dateStr === today.dateStr) {
        const nowMin = today.hh * 60 + today.mm;
        if (t < nowMin + 15) continue;
      }

      slots.push({
        timeSlot: minutesToSlot(t),
        endTimeSlot: minutesToSlot(end),
        durationMinutes,
      });
    }

    return {
      ok: true,
      partnerId,
      itemId: item.id,
      serviceName: item.name,
      dateStr,
      dateFriendly: formatFriendly(dateStr),
      durationMinutes,
      closed: false,
      slots,
    };
  }

  /**
   * Books a SERVICE item inside an atomic BEGIN IMMEDIATE transaction.
   * Enforces Elo 1 (SERVICE-only) and Elo 2 (confirmed === true, SQLite pricing/duration,
   * idempotencyKey, interval overlap check, and idx_appointments_unique_slot).
   * @param {{
   *   partnerId: string,
   *   itemId: string,
   *   dateStr: string,
   *   timeSlot: string,
   *   clientName: string,
   *   customerPhone?: string | null,
   *   customerId?: string | null,
   *   confirmed: boolean,
   *   idempotencyKey?: string | null,
   *   itemVersionHash?: string | null
   * }} params
   */
  bookService(params = {}) {
    const {
      partnerId,
      itemId,
      dateStr: rawDateStr,
      timeSlot: rawTimeSlot,
      clientName: rawClientName,
      customerPhone = null,
      customerId = null,
      confirmed,
      idempotencyKey = null,
      itemVersionHash = null,
    } = params;

    if (!partnerId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId é obrigatório.');
    }
    if (confirmed !== true) {
      throw new DomainError(
        'CONFIRMATION_REQUIRED',
        'Confirmação explícita (confirmed: true) é obrigatória para concluir o agendamento.'
      );
    }

    const clientName = String(rawClientName || '').trim();
    if (!clientName) {
      throw new DomainError('VALIDATION_ERROR', 'clientName é obrigatório.');
    }

    const dateStr = requireDateStr(rawDateStr);
    const timeSlot = requireTimeSlot(rawTimeSlot);
    const today = this._nowSP();
    const slotMin = slotToMinutes(timeSlot);
    const nowMin = today.hh * 60 + today.mm;

    if (
      dateStr < today.dateStr ||
      (dateStr === today.dateStr && slotMin <= nowMin)
    ) {
      throw new DomainError(
        'PAST_DATE_NOT_ALLOWED',
        `Não é possível agendar no passado (${dateStr} às ${timeSlot}). Agora em São Paulo são ${today.dateStr} ${today.timeSlot}. Solicite uma data e horário futuros.`,
        {
          dateStr,
          timeSlot,
          currentDateStr: today.dateStr,
          currentTimeSlot: today.timeSlot,
        },
        400
      );
    }

    return this.dbManager.transaction(() => {
      if (idempotencyKey) {
        const existingByKey = this.appointmentRepository.findByIdempotencyKey(
          idempotencyKey,
          { partnerId }
        );
        if (existingByKey) {
          return {
            ok: true,
            idempotent: true,
            appointment: existingByKey,
          };
        }
      }

      // Elo 1: validate active SERVICE item strictly from SQLite
      const item = this._requireServiceItem(partnerId, itemId, itemVersionHash);
      const durationMinutes = Number(item.duration_minutes) || 30;
      const startMin = slotToMinutes(timeSlot);
      const endMin = startMin + durationMinutes;

      // Enforce partner working hours when explicitly configured
      const partner = this.partnerRepository.findById(partnerId);
      const window = resolveWorkingWindow(partner, dateStr);
      if (window.configured) {
        if (!window.open) {
          throw new DomainError(
            'CLOSED_DAY',
            `O estabelecimento não atende em ${formatFriendly(dateStr)}.`,
            { dateStr, weekday: window.weekday },
            409
          );
        }
        if (startMin < window.startMin || endMin > window.endMin) {
          throw new DomainError(
            'OUTSIDE_HOURS',
            `Horário fora do expediente (${window.start}–${window.end}).`,
            { dateStr, timeSlot, start: window.start, end: window.end },
            409
          );
        }
      }

      // Elo 2: check interval overlap [startMin, endMin) against CONFIRMED appointments of same day
      const confirmedAppts = this.appointmentRepository.listByPartnerAndDate(
        partnerId,
        dateStr,
        { status: 'CONFIRMED' }
      );
      for (const appt of confirmedAppts) {
        const bStart = slotToMinutes(appt.time_slot);
        if (bStart === null) continue;
        const bEnd = bStart + (Number(appt.duration_minutes_snapshot) || 30);
        if (startMin < bEnd && endMin > bStart) {
          throw new DomainError(
            'SLOT_TAKEN',
            `O horário ${timeSlot} em ${formatFriendly(dateStr)} colide com um agendamento existente.`,
            {
              dateStr,
              timeSlot,
              conflictingAppointmentId: appt.id,
              conflictingSlot: appt.time_slot,
            },
            409
          );
        }
      }

      try {
        const appointment = this.appointmentRepository.create({
          partnerId,
          customerId,
          catalogItemId: item.id,
          itemNameSnapshot: item.name,
          priceCentsSnapshot: Number(item.price_cents),
          durationMinutesSnapshot: durationMinutes,
          clientName,
          customerPhone,
          dateStr,
          timeSlot,
          status: 'CONFIRMED',
          idempotencyKey,
        });

        return {
          ok: true,
          idempotent: false,
          appointment,
        };
      } catch (err) {
        if (err && err.code === 'ERR_SQLITE_ERROR' && /UNIQUE constraint failed/i.test(err.message)) {
          throw new DomainError(
            'SLOT_TAKEN',
            `O horário ${timeSlot} em ${formatFriendly(dateStr)} não está mais disponível.`,
            { dateStr, timeSlot },
            409
          );
        }
        throw err;
      }
    });
  }

  /**
   * Cancels an appointment belonging to `partnerId`, releasing its slot.
   * @param {{ partnerId: string, appointmentId: string }} params
   */
  cancelAppointment({ partnerId, appointmentId }) {
    if (!partnerId || !appointmentId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId e appointmentId são obrigatórios.');
    }

    return this.dbManager.transaction(() => {
      const existing = this.appointmentRepository.findById(appointmentId, { partnerId });
      if (!existing) {
        throw new DomainError(
          'APPOINTMENT_NOT_FOUND',
          `Agendamento "${appointmentId}" não encontrado.`,
          { partnerId, appointmentId },
          404
        );
      }
      if (existing.status === 'CANCELLED') {
        return { ok: true, alreadyCancelled: true, appointment: existing };
      }
      const updated = this.appointmentRepository.cancel(appointmentId, { partnerId });
      return { ok: true, alreadyCancelled: false, appointment: updated };
    });
  }

  /**
   * Lists appointments for a partner on a given date (or all dates when omitted if filtered).
   * @param {string} partnerId
   * @param {string} dateStr
   * @param {{ status?: string }} [options]
   */
  listByDate(partnerId, dateStr, options = {}) {
    return this.appointmentRepository.listByPartnerAndDate(
      partnerId,
      requireDateStr(dateStr),
      options
    );
  }

  /**
   * Computes daily summary statistics for dashboards.
   * @param {string} partnerId
   * @param {string} dateStr
   */
  getDailySummary(partnerId, dateStr) {
    const items = this.listByDate(partnerId, dateStr);
    let confirmedCount = 0;
    let cancelledCount = 0;
    let completedCount = 0;
    let totalConfirmedCents = 0;

    for (const ap of items) {
      if (ap.status === 'CONFIRMED') {
        confirmedCount += 1;
        totalConfirmedCents += Number(ap.price_cents_snapshot || 0);
      } else if (ap.status === 'CANCELLED') {
        cancelledCount += 1;
      } else if (ap.status === 'COMPLETED') {
        completedCount += 1;
        totalConfirmedCents += Number(ap.price_cents_snapshot || 0);
      }
    }

    return {
      partnerId,
      dateStr: requireDateStr(dateStr),
      totalCount: items.length,
      confirmedCount,
      cancelledCount,
      completedCount,
      totalConfirmedCents,
      totalConfirmedLabel: formatPriceCents(totalConfirmedCents),
    };
  }
}

module.exports = { BookingService, resolveWorkingWindow };
