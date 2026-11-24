'use strict';

/**
 * Strict CORS middleware configured via `CORS_ALLOWED_ORIGINS`.
 * Wildcard `*` is prohibited in production (`NODE_ENV=production`).
 */
class CorsMiddleware {
  /**
   * @param {{ allowedOrigins?: string[] | string, nodeEnv?: string }} [options]
   */
  constructor(options = {}) {
    this.nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
    const raw =
      options.allowedOrigins ??
      process.env.CORS_ALLOWED_ORIGINS ??
      'http://localhost:3000';

    if (Array.isArray(raw)) {
      this.allowedOrigins = raw.map((o) => String(o).trim()).filter(Boolean);
    } else {
      this.allowedOrigins = String(raw)
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    }

    if (this.nodeEnv === 'production' && this.allowedOrigins.includes('*')) {
      throw new Error('CORS wildcard "*" is prohibited in production');
    }
  }

  /**
   * Checks if a given request origin is whitelisted.
   * @param {string | undefined} origin
   * @returns {boolean}
   */
  isOriginAllowed(origin) {
    if (!origin) return false;
    if (this.nodeEnv !== 'production' && this.allowedOrigins.includes('*')) {
      return true;
    }
    return this.allowedOrigins.includes(origin);
  }

  /**
   * Applies CORS headers and handles OPTIONS preflight requests.
   * Returns `true` if the response was terminated (preflight or forbidden origin).
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @returns {boolean}
   */
  handle(req, res) {
    const origin = req.headers.origin;

    if (origin && this.isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-api-key, X-Idempotency-Key'
    );

    if (req.method === 'OPTIONS') {
      if (origin && !this.isOriginAllowed(origin)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: { code: 'CORS_ORIGIN_FORBIDDEN', message: 'Origin not allowed' },
          })
        );
        return true;
      }
      res.writeHead(204);
      res.end();
      return true;
    }

    return false;
  }
}

module.exports = { CorsMiddleware };
