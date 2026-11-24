'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STATIC_MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
});
const { DomainError } = require('../domain/RegionalNormalizer');
const { CorsMiddleware } = require('./middlewares/CorsMiddleware');
const { AuthMiddleware } = require('./middlewares/AuthMiddleware');
const { SseManager } = require('./events/SseManager');
const { WebhookDispatcher } = require('./events/WebhookDispatcher');
const { createHealthRoutes } = require('./routes/HealthRoutes');
const { createAuthRoutes } = require('./routes/AuthRoutes');
const { createPartnerRoutes } = require('./routes/PartnerRoutes');
const { createFeatureRoutes } = require('./routes/FeatureRoutes');
const { createCatalogRoutes } = require('./routes/CatalogRoutes');
const { createBookingRoutes } = require('./routes/BookingRoutes');
const { createOrderRoutes } = require('./routes/OrderRoutes');
const { createChannelRoutes } = require('./routes/ChannelRoutes');
const { createConversationRoutes } = require('./routes/ConversationRoutes');
const { createWebhookRoutes } = require('./routes/WebhookRoutes');

/**
 * Compiles an express-style path (`/api/v1/partners/:partnerId/catalog/:itemId`)
 * into a RegExp and ordered parameter key array.
 * @param {string} pathPattern
 */
function compileRoutePath(pathPattern) {
  const keys = [];
  const escaped = pathPattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return {
    keys,
    regex: new RegExp(`^${escaped}$`),
  };
}

/**
 * Native `node:http` REST + SSE Gateway Server implementing Doc 02 contracts.
 */
class GatewayServer {
  /**
   * @param {{
   *   dbManager: import('../storage/DatabaseManager').DatabaseManager,
   *   partnerRepository: import('../storage/repositories/PartnerRepository').PartnerRepository,
   *   authRepository: import('../storage/repositories/AuthRepository').AuthRepository,
   *   conversationRepository: import('../storage/repositories/ConversationRepository').ConversationRepository,
   *   appointmentRepository: import('../storage/repositories/AppointmentRepository').AppointmentRepository,
   *   queueRepository: import('../storage/repositories/QueueRepository').QueueRepository,
   *   catalogService: import('../domain/CatalogService').CatalogService,
   *   bookingService: import('../domain/BookingService').BookingService,
   *   orderService: import('../domain/OrderService').OrderService,
   *   pdfService: import('../domain/PdfService').PdfService,
   *   promptPin?: import('../ai/PromptPin').PromptPin,
   *   llmRouter?: import('../ai/LlmRouter').LlmRouter,
   *   sessionManager: import('../messaging/SessionManager').SessionManager,
   *   pauseController: import('../messaging/PauseController').PauseController,
   *   corsMiddleware?: CorsMiddleware,
   *   authMiddleware?: AuthMiddleware,
   *   sseManager?: SseManager,
   *   webhookDispatcher?: WebhookDispatcher
   * }} deps
   */
  constructor(deps = {}) {
    this.deps = deps;
    this.serveStaticUi =
      deps.serveStaticUi !== undefined
        ? Boolean(deps.serveStaticUi)
        : process.env.SERVE_STATIC_UI === 'true';
    this.staticDistDir = path.resolve(
      deps.staticDistDir || path.resolve(__dirname, '../../app-web/dist')
    );
    this.corsMiddleware = deps.corsMiddleware || new CorsMiddleware();
    this.authMiddleware =
      deps.authMiddleware ||
      new AuthMiddleware({ authRepository: deps.authRepository });
    this.sseManager = deps.sseManager || new SseManager();
    this.webhookDispatcher =
      deps.webhookDispatcher ||
      new WebhookDispatcher({
        partnerRepository: deps.partnerRepository,
        sseManager: this.sseManager,
      });

    const routeDefs = [
      ...createHealthRoutes({
        dbManager: deps.dbManager,
        promptPin: deps.promptPin,
        queueRepository: deps.queueRepository,
        llmRouter: deps.llmRouter,
      }),
      ...createAuthRoutes({
        partnerRepository: deps.partnerRepository,
        authRepository: deps.authRepository,
        authMiddleware: this.authMiddleware,
      }),
      ...createPartnerRoutes({
        partnerRepository: deps.partnerRepository,
      }),
      ...createFeatureRoutes({
        partnerRepository: deps.partnerRepository,
      }),
      ...createCatalogRoutes({
        catalogService: deps.catalogService,
        queueRepository: deps.queueRepository,
      }),
      ...createBookingRoutes({
        bookingService: deps.bookingService,
        appointmentRepository: deps.appointmentRepository,
        partnerRepository: deps.partnerRepository,
        pdfService: deps.pdfService,
        webhookDispatcher: this.webhookDispatcher,
      }),
      ...createOrderRoutes({
        orderService: deps.orderService,
        partnerRepository: deps.partnerRepository,
        pdfService: deps.pdfService,
        webhookDispatcher: this.webhookDispatcher,
      }),
      ...createChannelRoutes({
        sessionManager: deps.sessionManager,
        authMiddleware: this.authMiddleware,
      }),
      ...createConversationRoutes({
        conversationRepository: deps.conversationRepository,
        partnerRepository: deps.partnerRepository,
        pauseController: deps.pauseController,
        sessionManager: deps.sessionManager,
        webhookDispatcher: this.webhookDispatcher,
      }),
      ...createWebhookRoutes({
        sseManager: this.sseManager,
        webhookDispatcher: this.webhookDispatcher,
        partnerRepository: deps.partnerRepository,
      }),
    ];

    this.routes = routeDefs.map((r) => ({
      ...r,
      ...compileRoutePath(r.path),
    }));

    this.server = http.createServer((req, res) => {
      this._handleRequest(req, res);
    });
  }

  /**
   * Matches an HTTP method and pathname to a registered route.
   * @private
   */
  _matchRoute(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = route.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      for (let i = 0; i < route.keys.length; i += 1) {
        params[route.keys[i]] = m[i + 1];
      }
      return { route, params };
    }
    return null;
  }

  /**
   * Main HTTP request pipeline: CORS -> Routing -> Auth -> Body Parse -> Handler -> Envelope.
   * @private
   */
  async _handleRequest(req, res) {
    const requestId = `req_${crypto.randomUUID().slice(0, 12)}`;
    const makeMeta = () => ({
      requestId,
      timestamp: new Date().toISOString(),
    });

    const sendJson = (statusCode, payload) => {
      if (res.writableEnded) return;
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify(payload));
    };

    const sendOk = (data, statusCode = 200) => {
      sendJson(statusCode, {
        ok: true,
        data,
        meta: makeMeta(),
      });
    };

    const sendError = (statusCode, code, message, details = undefined) => {
      const errorObj = { code, message };
      if (details !== undefined) errorObj.details = details;
      sendJson(statusCode, {
        ok: false,
        error: errorObj,
        meta: makeMeta(),
      });
    };

    try {
      if (this.corsMiddleware.handle(req, res)) {
        return;
      }

      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const pathname = parsedUrl.pathname;
      const matched = this._matchRoute(req.method || 'GET', pathname);

      if (!matched) {
        if (
          this.serveStaticUi &&
          (req.method === 'GET' || req.method === 'HEAD') &&
          !pathname.startsWith('/api/') &&
          pathname !== '/health'
        ) {
          const served = this._tryServeStatic(req, res, pathname, sendError);
          if (served) return;
        }
        return sendError(
          404,
          'NOT_FOUND',
          `Rota não encontrada: ${req.method} ${pathname}`
        );
      }

      const { route, params } = matched;
      let auth = null;

      if (!route.exempt) {
        const authRes = this.authMiddleware.authenticate(req);
        if (!authRes.ok) {
          return sendError(
            authRes.statusCode || 401,
            authRes.code || 'UNAUTHORIZED',
            authRes.message || 'Unauthorized'
          );
        }
        auth = authRes.auth;

        if (
          params.partnerId &&
          !this.authMiddleware.canAccessPartner(auth, params.partnerId)
        ) {
          return sendError(
            403,
            'FORBIDDEN',
            'Acesso negado ao recurso de outro parceiro.'
          );
        }
      }

      let body = {};
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        body = await AuthMiddleware.readJsonBody(req, {
          isUpload: Boolean(route.isUpload),
        });
      }

      await route.handler({
        req,
        res,
        params,
        query: parsedUrl.searchParams,
        headers: req.headers,
        body,
        auth,
        sendOk,
        sendError,
      });
    } catch (err) {
      if (err instanceof DomainError) {
        return sendError(
          err.statusCode || 400,
          err.code,
          err.message,
          err.details
        );
      }
      if (err?.statusCode && err?.code) {
        return sendError(err.statusCode, err.code, err.message);
      }
      if (err?.code === 'MAX_LINES_EXCEEDED') {
        return sendError(409, err.code, err.message);
      }
      if (err?.code === 'PARTNER_NOT_FOUND' || err?.code === 'PARTNER_INACTIVE') {
        return sendError(404, err.code, err.message);
      }
      return sendError(
        500,
        'INTERNAL_SERVER_ERROR',
        err?.message || 'Internal Server Error'
      );
    }
  }

  /**
   * Serves static SPA/PWA assets from `staticDistDir` when `SERVE_STATIC_UI=true`,
   * with strict path-traversal protection and SPA `index.html` fallback.
   * @private
   */
  _tryServeStatic(req, res, pathname, sendError) {
    if (!fs.existsSync(this.staticDistDir)) {
      return false;
    }

    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      sendError(400, 'BAD_REQUEST', 'URL inválida.');
      return true;
    }

    if (decoded.includes('\0') || decoded.includes('..')) {
      sendError(403, 'FORBIDDEN', 'Caminho inválido.');
      return true;
    }

    const relativePath = decoded.replace(/^\/+/, '');
    const candidate = relativePath
      ? path.resolve(this.staticDistDir, relativePath)
      : path.join(this.staticDistDir, 'index.html');

    if (
      candidate !== this.staticDistDir &&
      !candidate.startsWith(this.staticDistDir + path.sep)
    ) {
      sendError(403, 'FORBIDDEN', 'Acesso negado.');
      return true;
    }

    let targetFile = null;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      targetFile = candidate;
    } else if (!path.extname(decoded)) {
      const fallbackIndex = path.join(this.staticDistDir, 'index.html');
      if (fs.existsSync(fallbackIndex) && fs.statSync(fallbackIndex).isFile()) {
        targetFile = fallbackIndex;
      }
    }

    if (!targetFile) {
      return false;
    }

    const ext = path.extname(targetFile).toLowerCase();
    const contentType =
      STATIC_MIME_TYPES[ext] || 'application/octet-stream';
    const data = fs.readFileSync(targetFile);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
    });
    if (req.method === 'HEAD') {
      res.end();
    } else {
      res.end(data);
    }
    return true;
  }

  /**
   * Starts listening on the specified port and host.
   * @param {{ port?: number, host?: string }} [options]
   * @returns {Promise<{ port: number, address: string, baseUrl: string }>}
   */
  listen(options = {}) {
    const port =
      options.port !== undefined ? Number(options.port) : Number(process.env.PORT || 3000);
    const host = options.host || '127.0.0.1';

    return new Promise((resolve, reject) => {
      const onError = (err) => {
        this.server.off('error', onError);
        reject(err);
      };
      this.server.once('error', onError);
      this.server.listen(port, host, () => {
        this.server.off('error', onError);
        const addr = this.server.address();
        const boundPort = typeof addr === 'object' && addr ? addr.port : port;
        const boundHost =
          typeof addr === 'object' && addr && addr.address !== '::'
            ? addr.address
            : host;
        resolve({
          port: boundPort,
          address: boundHost,
          baseUrl: `http://${boundHost}:${boundPort}`,
        });
      });
    });
  }

  /**
   * Closes SSE streams, webhook retry timers, and the HTTP server cleanly.
   */
  async close() {
    this.sseManager.close();
    this.webhookDispatcher.close();

    if (!this.server.listening) {
      return;
    }

    await new Promise((resolve) => {
      this.server.close(() => resolve());
      if (typeof this.server.closeAllConnections === 'function') {
        this.server.closeAllConnections();
      }
    });
  }
}

module.exports = { GatewayServer, compileRoutePath };
