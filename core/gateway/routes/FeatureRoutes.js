'use strict';

const {
  DEFAULT_FEATURE_FLAGS,
} = require('../../storage/repositories/PartnerRepository');

/**
 * Checks whether a partner feature flag is enabled; returns false and emits
 * HTTP `403 FEATURE_DISABLED` when disabled.
 * @param {import('../../storage/repositories/PartnerRepository').PartnerRepository} partnerRepository
 * @param {string} partnerId
 * @param {string} featureName
 * @param {Function} sendError
 * @returns {boolean}
 */
function ensureFeatureEnabled(partnerRepository, partnerId, featureName, sendError) {
  const partner = partnerRepository.findById(partnerId);
  if (!partner) {
    sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
    return false;
  }
  const effective = { ...DEFAULT_FEATURE_FLAGS, ...(partner.feature_flags || {}) };
  if (effective[featureName] === false) {
    sendError(
      403,
      'FEATURE_DISABLED',
      `O módulo "${featureName}" está desativado para este parceiro.`,
      { partnerId, feature: featureName }
    );
    return false;
  }
  return true;
}

/**
 * Registers Painel de Chaves / Feature Flags routes (`GET/PUT /api/v1/partners/:partnerId/features`).
 * @param {{
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository
 * }} deps
 */
function createFeatureRoutes(deps) {
  const { partnerRepository } = deps;

  return [
    {
      method: 'GET',
      path: '/api/v1/partners/:partnerId/features',
      handler: async ({ params, sendOk, sendError }) => {
        const partner = partnerRepository.findById(params.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }
        return sendOk({
          ...DEFAULT_FEATURE_FLAGS,
          ...(partner.feature_flags || {}),
        });
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/partners/:partnerId/features',
      handler: async ({ params, body, sendOk, sendError }) => {
        const partner = partnerRepository.findById(params.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }

        const current = {
          ...DEFAULT_FEATURE_FLAGS,
          ...(partner.feature_flags || {}),
        };
        const merged = { ...current };
        for (const [k, v] of Object.entries(body || {})) {
          if (typeof v === 'boolean') {
            merged[k] = v;
          }
        }

        const updated = partnerRepository.update(params.partnerId, {
          featureFlags: merged,
        });
        return sendOk(updated.feature_flags);
      },
    },
  ];
}

module.exports = { createFeatureRoutes, ensureFeatureEnabled };
