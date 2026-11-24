'use strict';

const { nowSP } = require('../../domain/RegionalNormalizer');
const { ensureFeatureEnabled } = require('./FeatureRoutes');

/**
 * Registers Appointment routes (`/api/v1/partners/:partnerId/appointments*`).
 * @param {{
 *   bookingService: import('../../domain/BookingService').BookingService,
 *   appointmentRepository: import('../../storage/repositories/AppointmentRepository').AppointmentRepository,
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository,
 *   pdfService: import('../../domain/PdfService').PdfService,
 *   webhookDispatcher?: import('../events/WebhookDispatcher').WebhookDispatcher
 * }} deps
 */
function createBookingRoutes(deps) {
  const {
    bookingService,
    appointmentRepository,
    partnerRepository,
    pdfService,
    webhookDispatcher,
  } = deps;

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/appointments',
      handler: async ({ params, query, sendOk }) => {
        const dateStr = query.get('date') || undefined;
        const status = query.get('status') || undefined;
        const rows = appointmentRepository.listByPartner(params.partnerId, {
          dateStr,
          status,
        });
        return sendOk(rows);
      },
    },
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/appointments/summary',
      handler: async ({ params, query, sendOk }) => {
        const dateStr = query.get('date') || nowSP().dateStr;
        const summary = bookingService.getDailySummary(params.partnerId, dateStr);
        const appointments = bookingService.listByDate(params.partnerId, dateStr);
        return sendOk({
          ...summary,
          appointments,
        });
      },
    },
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/appointments/pdf',
      handler: async ({ params, query, res, sendError }) => {
        const partner = partnerRepository.findById(params.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }
        const dateStr = query.get('date') || nowSP().dateStr;
        const appointments = bookingService.listByDate(params.partnerId, dateStr);
        const { buffer } = pdfService.buildAppointmentsPdf({
          partnerName: partner.display_name,
          dateStr,
          appointments,
        });

        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="agenda_${dateStr}.pdf"`,
          'Content-Length': buffer.length,
        });
        res.end(buffer);
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/appointments',
      handler: async ({ params, body, headers, sendOk, sendError }) => {
        if (!ensureFeatureEnabled(partnerRepository, params.partnerId, 'bookings', sendError)) {
          return;
        }

        const idempotencyKey =
          headers['x-idempotency-key'] ||
          body.idempotencyKey ||
          body.idempotency_key ||
          null;

        const result = bookingService.bookService({
          partnerId: params.partnerId,
          itemId: body.itemId ?? body.item_id,
          dateStr: body.dateStr ?? body.date_str,
          timeSlot: body.timeSlot ?? body.time_slot,
          clientName: body.clientName ?? body.client_name,
          customerPhone: body.customerPhone ?? body.customer_phone ?? null,
          customerId: body.customerId ?? body.customer_id ?? null,
          confirmed: body.confirmed !== undefined ? body.confirmed : true,
          idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
          itemVersionHash: body.itemVersionHash ?? body.item_version_hash ?? null,
        });

        if (!result.idempotent && webhookDispatcher) {
          await webhookDispatcher.dispatch({
            eventType: 'appointment.confirmed',
            partnerId: params.partnerId,
            payload: {
              appointmentId: result.appointment.id,
              appointment: result.appointment,
            },
          });
        }

        return sendOk(
          {
            appointmentId: result.appointment.id,
            idempotent: result.idempotent,
            appointment: result.appointment,
          },
          result.idempotent ? 200 : 201
        );
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/appointments/:id/cancel',
      handler: async ({ params, sendOk, sendError }) => {
        if (!ensureFeatureEnabled(partnerRepository, params.partnerId, 'bookings', sendError)) {
          return;
        }
        const res = bookingService.cancelAppointment({
          partnerId: params.partnerId,
          appointmentId: params.id,
        });

        if (!res.alreadyCancelled && webhookDispatcher) {
          await webhookDispatcher.dispatch({
            eventType: 'appointment.cancelled',
            partnerId: params.partnerId,
            payload: {
              appointmentId: res.appointment.id,
              appointment: res.appointment,
            },
          });
        }

        return sendOk(res.appointment);
      },
    },
  ];
}

module.exports = { createBookingRoutes };
