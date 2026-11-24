'use strict';

const crypto = require('node:crypto');

/**
 * Hashes a password using scrypt and a random 16-byte salt.
 * @param {string} password
 * @returns {string}
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

/**
 * Verifies a plaintext password against a stored `salt:hash` string in constant time.
 * @param {string} password
 * @param {string} stored
 * @returns {boolean}
 */
function verifyPassword(password, stored) {
  if (!stored || !String(stored).includes(':')) return false;
  const [salt, hashHex] = String(stored).split(':');
  const derived = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/**
 * Strips sensitive fields before serializing partner DTO.
 * @param {Record<string, any> | null} partner
 */
function sanitizePartner(partner) {
  if (!partner) return null;
  const copy = { ...partner };
  delete copy.password_hash;
  return copy;
}

/**
 * Registers authentication routes (`/api/v1/auth/register`, `login`, `session`).
 * @param {{
 *   partnerRepository: import('../../storage/repositories/PartnerRepository').PartnerRepository,
 *   authRepository: import('../../storage/repositories/AuthRepository').AuthRepository,
 *   authMiddleware: import('../middlewares/AuthMiddleware').AuthMiddleware
 * }} deps
 */
function createAuthRoutes(deps) {
  const { partnerRepository, authRepository, authMiddleware } = deps;

  return [
    {
      method: 'POST',
      path: '/api/v1/auth/register',
      exempt: true,
      handler: async ({ body, sendOk, sendError }) => {
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const displayName = String(
          body.displayName ?? body.name ?? body.display_name ?? ''
        ).trim();

        if (!email || !password || !displayName) {
          return sendError(
            400,
            'VALIDATION_ERROR',
            'email, password e displayName são obrigatórios.'
          );
        }

        const existing = partnerRepository.findByEmail(email);
        if (existing) {
          return sendError(
            409,
            'EMAIL_ALREADY_EXISTS',
            'Este e-mail já está cadastrado.'
          );
        }

        const partner = partnerRepository.create({
          id: body.id,
          email,
          passwordHash: hashPassword(password),
          displayName,
          storeSegment: body.storeSegment ?? body.store_segment ?? null,
        });

        const { token, expiresAtMs } = authMiddleware.signJwt({
          partnerId: partner.id,
          email: partner.email,
        });
        authRepository.createSession({
          token,
          partnerId: partner.id,
          expiresAt: expiresAtMs,
        });

        return sendOk(
          {
            partner: sanitizePartner(partner),
            token,
            expiresAt: expiresAtMs,
          },
          201
        );
      },
    },
    {
      method: 'POST',
      path: '/api/v1/auth/login',
      exempt: true,
      handler: async ({ body, sendOk, sendError }) => {
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        if (!email || !password) {
          return sendError(
            400,
            'VALIDATION_ERROR',
            'email e password são obrigatórios.'
          );
        }

        const partner = partnerRepository.findByEmail(email);
        if (!partner || !verifyPassword(password, partner.password_hash)) {
          return sendError(
            401,
            'INVALID_CREDENTIALS',
            'E-mail ou senha inválidos.'
          );
        }

        const { token, expiresAtMs } = authMiddleware.signJwt({
          partnerId: partner.id,
          email: partner.email,
        });
        authRepository.createSession({
          token,
          partnerId: partner.id,
          expiresAt: expiresAtMs,
        });

        return sendOk({
          partner: sanitizePartner(partner),
          token,
          expiresAt: expiresAtMs,
        });
      },
    },
    {
      method: 'GET',
      path: '/api/v1/auth/session',
      handler: async ({ auth, sendOk, sendError }) => {
        if (auth.type === 'api_key') {
          return sendOk({
            authType: 'api_key',
            partnerId: null,
          });
        }
        const partner = partnerRepository.findById(auth.partnerId);
        if (!partner) {
          return sendError(404, 'PARTNER_NOT_FOUND', 'Parceiro não encontrado.');
        }
        return sendOk({
          authType: 'bearer',
          partner: sanitizePartner(partner),
        });
      },
    },
  ];
}

module.exports = { createAuthRoutes, hashPassword, verifyPassword };
