'use strict';

const { hashPassword } = require('../gateway/routes/AuthRoutes');

/**
 * Idempotently seeds a default PME administrator partner account on boot when
 * `ADMIN_EMAIL` and `ADMIN_PASSWORD` are configured in environment variables
 * (or passed via `options`).
 *
 * Ensures operators never lose panel login access after an ephemeral container
 * restart (e.g., Render Free spin-down/redeploy), while NEVER overwriting an
 * already persisted partner's password, profile, or catalog.
 *
 * @param {{
 *   partnerRepository: import('../storage/repositories/PartnerRepository').PartnerRepository,
 *   email?: string,
 *   password?: string,
 *   displayName?: string,
 *   storeSegment?: string | null,
 *   partnerId?: string
 * }} deps
 * @returns {{ seeded: boolean, reason: string, partner: Record<string, any> | null }}
 */
function seedDefaultPartner(deps = {}) {
  const { partnerRepository } = deps;
  if (!partnerRepository) {
    throw new Error('seedDefaultPartner requires partnerRepository');
  }

  const email = String(deps.email ?? process.env.ADMIN_EMAIL ?? '')
    .trim()
    .toLowerCase();
  const password = String(deps.password ?? process.env.ADMIN_PASSWORD ?? '');

  if (!email || !password) {
    return { seeded: false, reason: 'NOT_CONFIGURED', partner: null };
  }

  const existing = partnerRepository.findByEmail(email);
  if (existing) {
    return { seeded: false, reason: 'ALREADY_EXISTS', partner: existing };
  }

  const configuredId = String(deps.partnerId ?? process.env.ADMIN_PARTNER_ID ?? '').trim();
  if (configuredId) {
    const existingById = partnerRepository.findById(configuredId);
    if (existingById) {
      return { seeded: false, reason: 'ALREADY_EXISTS', partner: existingById };
    }
  }

  const displayName =
    String(deps.displayName ?? process.env.ADMIN_DISPLAY_NAME ?? '').trim() ||
    email.split('@')[0] ||
    'Administrador PME';
  const storeSegment =
    String(deps.storeSegment ?? process.env.ADMIN_STORE_SEGMENT ?? '').trim() || null;

  const partner = partnerRepository.create({
    id: configuredId || undefined,
    email,
    passwordHash: hashPassword(password),
    displayName,
    storeSegment,
  });

  return { seeded: true, reason: 'CREATED', partner };
}

module.exports = { seedDefaultPartner };
