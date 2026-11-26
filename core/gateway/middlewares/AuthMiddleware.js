'use strict';

const crypto = require('node:crypto');

const DEFAULT_JSON_LIMIT_BYTES = 2 * 1024 * 1024; // 2 MiB
const UPLOAD_JSON_LIMIT_BYTES = 15 * 1024 * 1024; // 15 MiB
const DEFAULT_JWT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days (aligned with legacy session persistence)

/**
 * Constant-time string equality using `crypto.timingSafeEqual`.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Encodes a Buffer or string as base64url.
 * @param {Buffer | string} input
 * @returns {string}
 */
function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64url');
}

/**
 * Decodes a base64url string.
 * @param {string} str
 * @returns {string}
 */
function base64UrlDecode(str) {
  return Buffer.from(String(str), 'base64url').toString('utf8');
}

/**
 * Global authentication, JWT HS256 / API-Key validation, and payload size guard.
 */
class AuthMiddleware {
  /**
   * @param {{
   *   jwtSecret?: string,
   *   internalApiKey?: string,
   *   authRepository?: import('../../storage/repositories/AuthRepository').AuthRepository,
   *   nodeEnv?: string
   * }} [options]
   */
  constructor(options = {}) {
    this.nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
    const configuredJwt = options.jwtSecret ?? process.env.JWT_SECRET;
    if (this.nodeEnv === 'production' && !configuredJwt) {
      throw new Error('JWT_SECRET is strictly required in production');
    }
    this.jwtSecret = configuredJwt || crypto.randomBytes(32).toString('hex');
    this.internalApiKey =
      options.internalApiKey ?? process.env.INTERNAL_API_KEY ?? null;
    this.authRepository = options.authRepository || null;
  }

  /**
   * Signs an HS256 JWT token cleanly with node:crypto.
   * @param {Record<string, unknown>} payload
   * @param {{ expiresInSeconds?: number }} [options]
   * @returns {{ token: string, expiresAtMs: number }}
   */
  signJwt(payload, options = {}) {
    const envTtl = Number(process.env.JWT_TTL_SECONDS);
    const defaultTtl =
      Number.isFinite(envTtl) && envTtl > 0 ? Math.trunc(envTtl) : DEFAULT_JWT_TTL_SECONDS;
    const ttlSec = Number.isInteger(options.expiresInSeconds)
      ? options.expiresInSeconds
      : defaultTtl;
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = nowSec + ttlSec;

    const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64UrlEncode(
      JSON.stringify({
        ...payload,
        iat: nowSec,
        exp: expSec,
      })
    );
    const signingInput = `${header}.${body}`;
    const sig = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(signingInput)
      .digest('base64url');

    return {
      token: `${signingInput}.${sig}`,
      expiresAtMs: expSec * 1000,
    };
  }

  /**
   * Verifies an HS256 JWT token using constant-time signature comparison.
   * @param {string} token
   * @returns {Record<string, any> | null}
   */
  verifyJwt(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (!safeCompare(sig, expectedSig)) {
      return null;
    }

    try {
      const payload = JSON.parse(base64UrlDecode(body));
      if (payload.exp && Date.now() >= Number(payload.exp) * 1000) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Determines whether a route is exempt from authentication.
   * Exempt: GET /health, POST /api/v1/auth/register, POST /api/v1/auth/login.
   * @param {string} method
   * @param {string} pathname
   * @returns {boolean}
   */
  isExempt(method, pathname) {
    if (method === 'GET' && pathname === '/health') return true;
    if (method === 'POST' && pathname === '/api/v1/auth/register') return true;
    if (method === 'POST' && pathname === '/api/v1/auth/login') return true;
    return false;
  }

  /**
   * Authenticates an incoming HTTP request using Bearer JWT or `x-api-key`.
   * @param {import('node:http').IncomingMessage} req
   * @returns {{ ok: boolean, auth?: { type: 'api_key' | 'bearer', partnerId: string | null, email?: string }, statusCode?: number, code?: string, message?: string }}
   */
  authenticate(req) {
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && this.internalApiKey) {
      if (safeCompare(String(apiKeyHeader), String(this.internalApiKey))) {
        return {
          ok: true,
          auth: { type: 'api_key', partnerId: null },
        };
      }
      return {
        ok: false,
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Invalid internal API key.',
      };
    }

    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.slice(7).trim();
      const payload = this.verifyJwt(rawToken);
      if (!payload || !payload.partnerId) {
        return {
          ok: false,
          statusCode: 401,
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired Bearer token.',
        };
      }

      if (this.authRepository) {
        const { AuthRepository } = require('../../storage/repositories/AuthRepository');
        const tokenHash = AuthRepository.hashToken(rawToken);
        const session = this.authRepository.findValidSession(tokenHash);
        if (!session) {
          return {
            ok: false,
            statusCode: 401,
            code: 'SESSION_REVOKED',
            message: 'Session is expired or revoked.',
          };
        }
      }

      return {
        ok: true,
        auth: {
          type: 'bearer',
          partnerId: String(payload.partnerId),
          email: payload.email || null,
          token: rawToken,
        },
      };
    }

    return {
      ok: false,
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication required (Bearer token or x-api-key).',
    };
  }

  /**
   * Enforces partner-level access control for Bearer tokens on `:partnerId` routes.
   * @param {{ type: string, partnerId: string | null }} auth
   * @param {string} targetPartnerId
   * @returns {boolean}
   */
  canAccessPartner(auth, targetPartnerId) {
    if (!auth) return false;
    if (auth.type === 'api_key') return true;
    return String(auth.partnerId) === String(targetPartnerId);
  }

  /**
   * Reads and parses a JSON request body bounded by `maxBytes` (2 MiB default, 15 MiB uploads).
   * @param {import('node:http').IncomingMessage} req
   * @param {{ isUpload?: boolean, maxBytes?: number }} [options]
   * @returns {Promise<Record<string, any>>}
   */
  static readJsonBody(req, options = {}) {
    const maxBytes = Number.isInteger(options.maxBytes)
      ? options.maxBytes
      : options.isUpload
        ? UPLOAD_JSON_LIMIT_BYTES
        : DEFAULT_JSON_LIMIT_BYTES;

    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      let aborted = false;

      req.on('data', (chunk) => {
        if (aborted) return;
        total += chunk.length;
        if (total > maxBytes) {
          aborted = true;
          const err = new Error(`Payload exceeds maximum limit (${maxBytes} bytes)`);
          err.code = 'PAYLOAD_TOO_LARGE';
          err.statusCode = 413;
          reject(err);
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on('end', () => {
        if (aborted) return;
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        if (!raw) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          const err = new Error('Malformed JSON request body');
          err.code = 'BAD_REQUEST';
          err.statusCode = 400;
          reject(err);
        }
      });

      req.on('error', (err) => {
        if (!aborted) reject(err);
      });
    });
  }
}

AuthMiddleware.DEFAULT_JSON_LIMIT_BYTES = DEFAULT_JSON_LIMIT_BYTES;
AuthMiddleware.UPLOAD_JSON_LIMIT_BYTES = UPLOAD_JSON_LIMIT_BYTES;
AuthMiddleware.DEFAULT_JWT_TTL_SECONDS = DEFAULT_JWT_TTL_SECONDS;
AuthMiddleware.safeCompare = safeCompare;

module.exports = {
  AuthMiddleware,
  DEFAULT_JSON_LIMIT_BYTES,
  UPLOAD_JSON_LIMIT_BYTES,
  DEFAULT_JWT_TTL_SECONDS,
  safeCompare,
};
