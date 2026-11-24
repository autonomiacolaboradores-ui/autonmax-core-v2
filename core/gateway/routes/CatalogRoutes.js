'use strict';

/**
 * Formats a catalog item into Doc 02 REST payload DTO.
 * @param {Record<string, any>} item
 */
function toCatalogDto(item) {
  return {
    itemId: item.id,
    id: item.id,
    partnerId: item.partner_id,
    name: item.name,
    type: item.item_type,
    itemType: item.item_type,
    description: item.description,
    priceCents: Number(item.price_cents),
    price_cents: Number(item.price_cents),
    durationMinutes: Number(item.duration_minutes),
    duration_minutes: Number(item.duration_minutes),
    category: item.category,
    versionHash: item.version_hash,
    version_hash: item.version_hash,
    active: Number(item.active),
    updatedAt: item.updated_at,
  };
}

/**
 * Registers canonical Catalog routes (`/api/v1/partners/:partnerId/catalog`).
 * Supports `X-Idempotency-Key` for offline sync replay.
 * @param {{
 *   catalogService: import('../../domain/CatalogService').CatalogService,
 *   queueRepository?: import('../../storage/repositories/QueueRepository').QueueRepository
 * }} deps
 */
function createCatalogRoutes(deps) {
  const { catalogService, queueRepository } = deps;

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/catalog',
      handler: async ({ params, query, sendOk }) => {
        const items = catalogService.listItems(params.partnerId, {
          type: query.get('type') || undefined,
          includeInactive: query.get('includeInactive') === 'true',
          category: query.get('category') || undefined,
        });
        return sendOk(items.map(toCatalogDto));
      },
    },
    {
      method: 'POST',
      path: '/api/v1/partners/:partnerId/catalog',
      handler: async ({ params, body, headers, sendOk }) => {
        const idempotencyKey = headers['x-idempotency-key']
          ? String(headers['x-idempotency-key'])
          : null;

        if (idempotencyKey && queueRepository) {
          const eventKey = `cat:${params.partnerId}:${idempotencyKey}`;
          if (queueRepository.isEventProcessed(eventKey)) {
            const existing = body.id
              ? catalogService.getItemSpec(params.partnerId, body.id, {
                  includeInactive: true,
                })
              : catalogService
                  .listItems(params.partnerId, { includeInactive: true })
                  .find((i) => i.name === String(body.name || '').trim());
            if (existing) {
              return sendOk(toCatalogDto(existing), 200);
            }
          }
        }

        const created = catalogService.createItem(params.partnerId, body);
        if (idempotencyKey && queueRepository) {
          queueRepository.markEventProcessed(
            `cat:${params.partnerId}:${idempotencyKey}`,
            `api:${params.partnerId}`
          );
        }

        return sendOk(toCatalogDto(created), 201);
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/partners/:partnerId/catalog/:itemId',
      handler: async ({ params, body, sendOk }) => {
        const updated = catalogService.updateItem(
          params.partnerId,
          params.itemId,
          body
        );
        return sendOk(toCatalogDto(updated));
      },
    },
    {
      method: 'DELETE',
      path: '/api/v1/partners/:partnerId/catalog/:itemId',
      handler: async ({ params, sendOk }) => {
        const deactivated = catalogService.softDeleteItem(
          params.partnerId,
          params.itemId
        );
        return sendOk(toCatalogDto(deactivated));
      },
    },
  ];
}

module.exports = { createCatalogRoutes, toCatalogDto };
