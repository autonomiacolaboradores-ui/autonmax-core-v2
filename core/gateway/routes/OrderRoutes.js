'use strict';

const { nowSP } = require('../../domain/RegionalNormalizer');
const { ensureFeatureEnabled } = require('./FeatureRoutes');

/**
 * Registers Product Order routes (`/api/v1/partners/:partnerId/orders*`).
 * @param {{
 *   orderService: import('../../domain/OrderService').OrderService,
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository,
 *   pdfService: import('../../domain/PdfService').PdfService,
 *   webhookDispatcher?: import('../events/WebhookDispatcher').WebhookDispatcher
 * }} deps
 */
function createOrderRoutes(deps) {
  const { orderService, partnerRepository, pdfService, webhookDispatcher } = deps;

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/orders',
      handler: async ({ params, query, sendOk }) => {
        const status = query.get('status') || undefined;
        const dateFilter = query.get('date') || null;
        let rows = orderService.listOrders(params.partnerId, { status, limit: 500 });
        if (dateFilter) {
          rows = rows.filter((o) => String(o.created_at || '').startsWith(dateFilter));
        }
        return sendOk(rows);
      },
    },
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/orders/summary',
      handler: async ({ params, query, sendOk }) => {
        const dateStr = query.get('date') || null;
        const summary = orderService.getSummary(params.partnerId, dateStr);
        let orders = orderService.listOrders(params.partnerId, { limit: 500 });
        if (dateStr) {
          orders = orders.filter((o) => String(o.created_at || '').startsWith(dateStr));
        }
        return sendOk({
          ...summary,
          orders,
        });
      },
    },
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/orders/pdf',
      handler: async ({ params, query, res, sendError }) => {
        const partner = partnerRepository.findById(params.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }
        const dateStr = query.get('date') || nowSP().dateStr;
        const orders = orderService
          .listOrders(params.partnerId, { limit: 500 })
          .filter((o) => String(o.created_at || '').startsWith(dateStr));
        const { buffer } = pdfService.buildOrdersPdf({
          partnerName: partner.display_name,
          dateStr,
          orders,
        });

        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="pedidos_${dateStr}.pdf"`,
          'Content-Length': buffer.length,
        });
        res.end(buffer);
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/orders',
      handler: async ({ params, body, headers, sendOk, sendError }) => {
        if (!ensureFeatureEnabled(partnerRepository, params.partnerId, 'orders', sendError)) {
          return;
        }

        const idempotencyKey =
          headers['x-idempotency-key'] ||
          body.idempotencyKey ||
          body.idempotency_key ||
          null;

        const result = orderService.createOrder({
          partnerId: params.partnerId,
          items: body.items,
          clientName: body.clientName ?? body.client_name,
          customerPhone: body.customerPhone ?? body.customer_phone ?? null,
          customerId: body.customerId ?? body.customer_id ?? null,
          paymentMethod: body.paymentMethod ?? body.payment_method ?? null,
          deliveryType: body.deliveryType ?? body.delivery_type ?? null,
          address: body.address ?? null,
          notes: body.notes ?? null,
          confirmed: body.confirmed !== undefined ? body.confirmed : true,
          idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
        });

        if (!result.idempotent && webhookDispatcher) {
          await webhookDispatcher.dispatch({
            eventType: 'order.confirmed',
            partnerId: params.partnerId,
            payload: {
              orderId: result.order.id,
              order: result.order,
            },
          });
        }

        return sendOk(
          {
            orderId: result.order.id,
            idempotent: result.idempotent,
            order: result.order,
          },
          result.idempotent ? 200 : 201
        );
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/orders/:id/cancel',
      handler: async ({ params, sendOk, sendError }) => {
        if (!ensureFeatureEnabled(partnerRepository, params.partnerId, 'orders', sendError)) {
          return;
        }
        const res = orderService.cancelOrder({
          partnerId: params.partnerId,
          orderId: params.id,
        });

        if (!res.alreadyCancelled && webhookDispatcher) {
          await webhookDispatcher.dispatch({
            eventType: 'order.cancelled',
            partnerId: params.partnerId,
            payload: {
              orderId: res.order.id,
              order: res.order,
            },
          });
        }

        return sendOk(res.order);
      },
    },
  ];
}

module.exports = { createOrderRoutes };
