# AUTON.MAX vNext — Snapshot Completo do Estado Atual (Volume 01/03)

> Gerado integralmente a partir do código-fonte atual em disco (zero truncamentos, pós-Ondas 1–4, migrations 001–003, calendário rolante 7 dias, trava anti-passado, proteção pós-commit e 51/51 testes).

## Tabela Resumo de Todos os Volumes

| Volume | Blocos Cobertos | Arquivos | Linhas do Volume | Tamanho |
| :--- | :--- | ---: | ---: | ---: |
| [VNEXT_ATUAL_01_BLOCOS_0_A_3.md](./VNEXT_ATUAL_01_BLOCOS_0_A_3.md) | Bloco 0, Bloco 1, Bloco 2, Bloco 3 | 29 | 7876 | 247.4 KB |
| [VNEXT_ATUAL_02_BLOCOS_3_A_6.md](./VNEXT_ATUAL_02_BLOCOS_3_A_6.md) | Bloco 3, Bloco 4, Bloco 5, Bloco 6 | 36 | 8510 | 270.5 KB |
| [VNEXT_ATUAL_03_BLOCOS_6_A_7.md](./VNEXT_ATUAL_03_BLOCOS_6_A_7.md) | Bloco 6, Bloco 7 | 28 | 8279 | 292.7 KB |

## Mapa de Correlação Arquitetural (Blocos 0 a 7)

```text
Bloco 0 (Boot & Verify: bin/start.js, scripts/verify.js)
  ├──▶ Bloco 1 (Camada 1: DatabaseManager, Migrations 001–003, Repositories, LifecycleManager)
  ├──▶ Bloco 2 (Camada 2: CatalogService, BookingService [PAST_DATE_NOT_ALLOWED], OrderService, RegionalNormalizer [buildRollingCalendarSP])
  ├──▶ Bloco 3 (Camada 3: PromptPin, LlmRouter [Gemini + thoughtSignature], AgentEngine [Calendário 7d + Um-por-Vez + Pós-Commit Fallback], AtomicOutputGuard)
  ├──▶ Bloco 4 (Camada 4: WhatsAppBaileysAdapter, SessionManager, MessageDebouncer, OutboundQueueWorker, PauseController)
  ├──▶ Bloco 5 (Camada 5: GatewayServer [no-store], Auth/Partner/Catalog/Booking/Order/Channel/Conversation/Health/Webhook Routes, SSE)
  ├──▶ Bloco 6 (Camada 6: app-web Dark Cyber Neon, sw.js Network-First, Dashboard/Catalog/Orders/Conversations, Capacitor Android, Render YAML)
  └──▶ Bloco 7 (Suíte E2E & Contratos: tests/layer1..layer6 — 51/51 testes)
```

## Índice dos Arquivos Neste Volume (29 arquivos)

- [package.json](#packagejson) (21 linhas)
- [.env.example](#envexample) (38 linhas)
- [.gitignore](#gitignore) (31 linhas)
- [bin/start.js](#binstartjs) (281 linhas)
- [scripts/build_web.js](#scriptsbuildwebjs) (214 linhas)
- [scripts/verify.js](#scriptsverifyjs) (165 linhas)
- [core/storage/DatabaseManager.js](#corestoragedatabasemanagerjs) (318 linhas)
- [core/storage/migrations/001_initial_schema.js](#corestoragemigrations001initialschemajs) (204 linhas)
- [core/storage/migrations/002_partner_profile_extensions.js](#corestoragemigrations002partnerprofileextensionsjs) (18 linhas)
- [core/storage/migrations/003_catalog_stock_control.js](#corestoragemigrations003catalogstockcontroljs) (21 linhas)
- [core/storage/migrations/index.js](#corestoragemigrationsindexjs) (131 linhas)
- [core/storage/repositories/AppointmentRepository.js](#corestoragerepositoriesappointmentrepositoryjs) (374 linhas)
- [core/storage/repositories/AuthRepository.js](#corestoragerepositoriesauthrepositoryjs) (132 linhas)
- [core/storage/repositories/CatalogRepository.js](#corestoragerepositoriescatalogrepositoryjs) (346 linhas)
- [core/storage/repositories/ConversationRepository.js](#corestoragerepositoriesconversationrepositoryjs) (384 linhas)
- [core/storage/repositories/CustomerRepository.js](#corestoragerepositoriescustomerrepositoryjs) (217 linhas)
- [core/storage/repositories/OrderRepository.js](#corestoragerepositoriesorderrepositoryjs) (316 linhas)
- [core/storage/repositories/PartnerRepository.js](#corestoragerepositoriespartnerrepositoryjs) (397 linhas)
- [core/storage/repositories/QueueRepository.js](#corestoragerepositoriesqueuerepositoryjs) (252 linhas)
- [core/lifecycle/LifecycleManager.js](#corelifecyclelifecyclemanagerjs) (244 linhas)
- [core/domain/BookingService.js](#coredomainbookingservicejs) (550 linhas)
- [core/domain/CatalogService.js](#coredomaincatalogservicejs) (229 linhas)
- [core/domain/CustomerService.js](#coredomaincustomerservicejs) (124 linhas)
- [core/domain/OrderService.js](#coredomainorderservicejs) (287 linhas)
- [core/domain/PdfService.js](#coredomainpdfservicejs) (278 linhas)
- [core/domain/RegionalNormalizer.js](#coredomainregionalnormalizerjs) (575 linhas)
- [core/ai/AgentEngine.js](#coreaiagentenginejs) (910 linhas)
- [core/ai/AtomicOutputGuard.js](#coreaiatomicoutputguardjs) (392 linhas)
- [core/ai/InputGuard.js](#coreaiinputguardjs) (98 linhas)

---

## Bloco 0 — Manifesto, Boot, Configuração & Scripts

### package.json

- **Bloco:** Bloco 0 — Manifesto, Boot, Configuração & Scripts
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `(arquivo de configuração / marcação / estilo)`
- **Total de linhas:** 21

~~~~json
{
  "name": "autonmax-vnext",
  "version": "4.0.0-vnext",
  "description": "AUTONMAX vNext — Pure vertical WhatsApp AI attendant with atomic SQLite booking lock",
  "type": "commonjs",
  "main": "bin/start.js",
  "scripts": {
    "start": "node bin/start.js",
    "test": "node --test tests/layer1_storage.test.js tests/layer2_domain.test.js tests/layer3_agent.test.js tests/layer4_messaging.test.js tests/layer5_gateway.test.js tests/layer6_offline_deploy.test.js",
    "build:web": "node scripts/build_web.js",
    "verify": "node scripts/verify.js"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.24",
    "link-preview-js": "^3.2.0",
    "qrcode": "^1.5.4"
  },
  "engines": {
    "node": ">=24.0.0"
  }
}
~~~~

### .env.example

- **Bloco:** Bloco 0 — Manifesto, Boot, Configuração & Scripts
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `(arquivo de configuração / marcação / estilo)`
- **Total de linhas:** 38

~~~~dotenv
# AUTONMAX vNext — Environment Configuration (Doc 02 Section 6)

# Infrastructure
PORT=3000
NODE_ENV=development
SERVE_STATIC_UI=false
JWT_SECRET=
INTERNAL_API_KEY=
DB_PATH=./workspace/autonmax.db
SESSIONS_DIR=./workspace/sessions
CORS_ALLOWED_ORIGINS=http://localhost:3000
NODE_OPTIONS=--max-old-space-size=384

# LLM Providers (Failover Cascade: Groq -> xAI -> OpenAI -> Gemini -> OpenRouter)
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
GROQ_FALLBACK_MODELS=llama-3.3-70b-versatile,openai/gpt-oss-20b
XAI_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
OPENROUTER_API_KEY=

# Voice (Cloud recommended for 512 MB RAM containers)
VOICE_STT_DRIVER=cloud
VOICE_TTS_DRIVER=off
WHISPER_BIN_PATH=/usr/bin/whisper
PIPER_BIN_PATH=/usr/bin/piper

# Messaging
DEBOUNCE_WINDOW_MS=2500
MAX_LINES_PER_PARTNER=2

# Webhooks & Optional Plugins
WEBHOOK_TARGET_URL=
WEBHOOK_SIGNING_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
~~~~

### .gitignore

- **Bloco:** Bloco 0 — Manifesto, Boot, Configuração & Scripts
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `(arquivo de configuração / marcação / estilo)`
- **Total de linhas:** 31

~~~~gitignore
# Dependencies
node_modules/

# Environment secrets
.env
.env.*
!.env.example

# SQLite & WhatsApp runtime state
workspace/*.db
workspace/*.db-*
workspace/sessions/

# Build artifacts
app-web/dist/
android/.gradle/
android/build/
android/app/build/

# Android signing secrets
android/keystore.properties
*.jks
*.keystore

# Logs & OS files
*.log
.DS_Store

# Archived historical markdown snapshots
docs/markdown codigo historico/
~~~~

### bin/start.js

- **Bloco:** Bloco 0 — Manifesto, Boot, Configuração & Scripts
- **Imports internos (`require` / `import`):** `core/ai/AgentEngine`, `core/ai/LlmRouter`, `core/ai/PromptPin`, `core/ai/voice/CloudVoiceAdapter`, `core/ai/voice/LocalVoiceAdapter`, `core/domain/BookingService`, `core/domain/CatalogService`, `core/domain/CustomerService`, `core/domain/OrderService`, `core/domain/PdfService`, `core/gateway/Server`, `core/lifecycle/LifecycleManager`, `core/messaging/MessageDebouncer`, `core/messaging/OutboundQueueWorker`, `core/messaging/PauseController`, `core/messaging/SessionManager`, `core/messaging/adapters/WhatsAppBaileysAdapter`, `core/storage/DatabaseManager`, `core/storage/repositories/AppointmentRepository`, `core/storage/repositories/AuthRepository`, `core/storage/repositories/CatalogRepository`, `core/storage/repositories/ConversationRepository`, `core/storage/repositories/CustomerRepository`, `core/storage/repositories/OrderRepository`, `core/storage/repositories/PartnerRepository`, `core/storage/repositories/QueueRepository`
- **Exports principais:** `bootstrap`, `loadNativeEnv`, `assertProductionSecrets`
- **Total de linhas:** 281

~~~~javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { DatabaseManager } = require('../core/storage/DatabaseManager');
const { PartnerRepository } = require('../core/storage/repositories/PartnerRepository');
const { AuthRepository } = require('../core/storage/repositories/AuthRepository');
const { CatalogRepository } = require('../core/storage/repositories/CatalogRepository');
const { CustomerRepository } = require('../core/storage/repositories/CustomerRepository');
const { ConversationRepository } = require('../core/storage/repositories/ConversationRepository');
const { AppointmentRepository } = require('../core/storage/repositories/AppointmentRepository');
const { OrderRepository } = require('../core/storage/repositories/OrderRepository');
const { QueueRepository } = require('../core/storage/repositories/QueueRepository');

const { CatalogService } = require('../core/domain/CatalogService');
const { BookingService } = require('../core/domain/BookingService');
const { OrderService } = require('../core/domain/OrderService');
const { CustomerService } = require('../core/domain/CustomerService');
const { PdfService } = require('../core/domain/PdfService');

const { PromptPin } = require('../core/ai/PromptPin');
const { LlmRouter } = require('../core/ai/LlmRouter');
const { AgentEngine } = require('../core/ai/AgentEngine');
const { CloudVoiceAdapter } = require('../core/ai/voice/CloudVoiceAdapter');
const { LocalVoiceAdapter } = require('../core/ai/voice/LocalVoiceAdapter');

const { WhatsAppBaileysAdapter } = require('../core/messaging/adapters/WhatsAppBaileysAdapter');
const { SessionManager } = require('../core/messaging/SessionManager');
const { MessageDebouncer } = require('../core/messaging/MessageDebouncer');
const { OutboundQueueWorker } = require('../core/messaging/OutboundQueueWorker');
const { PauseController } = require('../core/messaging/PauseController');

const { GatewayServer } = require('../core/gateway/Server');
const { LifecycleManager } = require('../core/lifecycle/LifecycleManager');

/**
 * Loads `.env` safely (handling CRLF, spaces around `=`, quotes, and `#` comments)
 * without overwriting variables already injected in `process.env`.
 */
function loadNativeEnv(envPath) {
  const candidates = envPath
    ? [path.resolve(envPath)]
    : [
        path.resolve(__dirname, '..', '.env'),
        path.resolve(process.cwd(), '.env'),
      ];

  const targetPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!targetPath) return false;

  const raw = fs.readFileSync(targetPath, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let val = (match[2] || '').trim();

    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    } else {
      const hashIdx = val.indexOf(' #');
      if (hashIdx !== -1) {
        val = val.slice(0, hashIdx).trim();
      }
    }

    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
  return true;
}

/**
 * Validates mandatory production secrets per Doc 02 Section 2.2.
 */
function assertProductionSecrets() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || !process.env.WEBHOOK_SIGNING_SECRET) {
      throw new Error(
        'FATAL: JWT_SECRET and WEBHOOK_SIGNING_SECRET are required when NODE_ENV=production'
      );
    }
  }
}

/**
 * Official production bootstrap orchestrating Layers 1 through 5 and LifecycleManager.
 * @param {{
 *   dbPath?: string,
 *   sessionsDir?: string,
 *   port?: number,
 *   host?: string,
 *   channelAdapter?: import('../core/messaging/ChannelAdapter').ChannelAdapter,
 *   llmRouter?: LlmRouter,
 *   startWorker?: boolean,
 *   startHttp?: boolean,
 *   installSignals?: boolean
 * }} [options]
 */
async function bootstrap(options = {}) {
  loadNativeEnv(options.envPath);
  assertProductionSecrets();

  const lifecycle = new LifecycleManager();

  // Layer 1 — Storage SQLite & Migrations
  const dbManager = new DatabaseManager({ dbPath: options.dbPath });
  dbManager.init();
  lifecycle.register('sqlite-db', () => dbManager.close());

  const partnerRepository = new PartnerRepository(dbManager);
  const authRepository = new AuthRepository(dbManager);
  const catalogRepository = new CatalogRepository(dbManager);
  const customerRepository = new CustomerRepository(dbManager);
  const conversationRepository = new ConversationRepository(dbManager);
  const appointmentRepository = new AppointmentRepository(dbManager);
  const orderRepository = new OrderRepository(dbManager);
  const queueRepository = new QueueRepository(dbManager);

  // Layer 2 — Domain Services
  const catalogService = new CatalogService({ dbManager, catalogRepository });
  const bookingService = new BookingService({
    dbManager,
    appointmentRepository,
    catalogRepository,
    partnerRepository,
  });
  const orderService = new OrderService({
    dbManager,
    orderRepository,
    catalogRepository,
  });
  const customerService = new CustomerService({ dbManager, customerRepository });
  const pdfService = new PdfService();

  // Layer 3 — AI Engine, PromptPin & VoiceAdapter
  const promptPin = new PromptPin();
  promptPin.verifyAtBoot({ strict: true });

  const sttDriver = String(process.env.VOICE_STT_DRIVER || 'cloud').toLowerCase();
  const voiceAdapter =
    sttDriver === 'local' ? new LocalVoiceAdapter() : new CloudVoiceAdapter();

  const llmRouter = options.llmRouter || new LlmRouter();
  const agentEngine = new AgentEngine({
    dbManager,
    llmRouter,
    promptPin,
    catalogService,
    bookingService,
    orderService,
    customerService,
    partnerRepository,
    conversationRepository,
    appointmentRepository,
    orderRepository,
  });

  // Layer 4 — Resilient Messaging
  const pauseController = new PauseController({ conversationRepository });
  const debouncer = new MessageDebouncer();

  let sessionManagerRef = null;
  const channelAdapter =
    options.channelAdapter ||
    new WhatsAppBaileysAdapter({
      voiceAdapter,
      authDirResolver: (sk) =>
        sessionManagerRef
          ? sessionManagerRef.resolveSessionPaths(sk).authDir
          : path.resolve(process.cwd(), 'workspace', 'sessions', DatabaseManager.sanitizeKey(sk), 'baileys_auth'),
      partnerIdResolver: (sk) => {
        const { parseSessionKey } = require('../core/messaging/SessionManager');
        return parseSessionKey(sk).partnerId;
      },
    });

  const outboxWorker = new OutboundQueueWorker({
    queueRepository,
    channelAdapter,
  });

  const sessionManager = new SessionManager({
    dbManager,
    sessionsDir: options.sessionsDir,
    channelAdapter,
    agentEngine,
    pauseController,
    debouncer,
    outboxWorker,
    partnerRepository,
    customerRepository,
    conversationRepository,
    queueRepository,
  });
  sessionManagerRef = sessionManager;
  sessionManager.bindInboundPipeline();
  if (options.restoreSessions !== false) {
    await sessionManager.restorePersistedSessions();
  }

  lifecycle.register('messaging-sessions', () => sessionManager.close());
  if (options.startWorker !== false) {
    outboxWorker.start();
  }
  lifecycle.register('outbox-worker', () => outboxWorker.stop());

  // Layer 5 — Gateway REST, SSE & Webhooks
  const server = new GatewayServer({
    dbManager,
    partnerRepository,
    authRepository,
    conversationRepository,
    appointmentRepository,
    queueRepository,
    catalogService,
    bookingService,
    orderService,
    pdfService,
    promptPin,
    llmRouter,
    agentEngine,
    sessionManager,
    pauseController,
  });

  // Forward guard & appointment/order commits from AgentEngine or SessionManager to SSE/Webhooks if desired
  lifecycle.register('http-gateway', () => server.close());

  let listenInfo = null;
  if (options.startHttp !== false) {
    listenInfo = await server.listen({
      port: options.port ?? Number(process.env.PORT || 3000),
      host: options.host || '0.0.0.0',
    });
  }

  if (options.installSignals !== false) {
    lifecycle.installSignals();
  }

  return {
    lifecycle,
    dbManager,
    promptPin,
    llmRouter,
    agentEngine,
    sessionManager,
    outboxWorker,
    pauseController,
    server,
    listenInfo,
  };
}

if (require.main === module) {
  bootstrap()
    .then(({ listenInfo, llmRouter }) => {
      if (listenInfo) {
        console.log(
          `[AUTONMAX vNext] Server listening on http://localhost:${listenInfo.port} (host=${listenInfo.address}, groqModel=${llmRouter.models.groq})`
        );
      }
    })
    .catch((err) => {
      console.error('[AUTONMAX_vNext_BOOT_FAILED]', err);
      process.exit(1);
    });
}

module.exports = { bootstrap, loadNativeEnv, assertProductionSecrets };
~~~~

### scripts/build_web.js

- **Bloco:** Bloco 0 — Manifesto, Boot, Configuração & Scripts
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `buildWeb`
- **Total de linhas:** 214

~~~~javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VNEXT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_APP_WEB_DIR = path.join(VNEXT_ROOT, 'app-web');
const DEFAULT_DIST_DIR = path.join(DEFAULT_APP_WEB_DIR, 'dist');

/**
 * Recursively copies static SPA/PWA assets from `srcDir` into `destDir`,
 * skipping the `dist` directory itself.
 * @param {string} srcDir
 * @param {string} destDir
 * @param {string} distRoot
 * @returns {number} Count of copied files
 */
function copyRecursive(srcDir, destDir, distRoot) {
  fs.mkdirSync(destDir, { recursive: true });
  let count = 0;

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (path.resolve(srcPath) === path.resolve(distRoot)) {
      continue;
    }

    if (entry.isDirectory()) {
      count += copyRecursive(srcPath, destPath, distRoot);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      count += 1;
    }
  }

  return count;
}

/**
 * Collects all `.js` files inside `dir` sorted deterministically.
 * @param {string} dir
 * @returns {string[]}
 */
function collectJsModules(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsModules(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * Generates a zero-dependency browser CommonJS bundle (`app.bundle.js`)
 * from `app-web/src/**\/*.js` so the SPA runs directly in browsers without Node `require`.
 * @param {string} appWebDir
 * @param {string} distDir
 */
function writeBrowserBundle(appWebDir, distDir) {
  const srcRoot = path.join(appWebDir, 'src');
  const jsFiles = collectJsModules(srcRoot);
  if (jsFiles.length === 0) return null;

  const moduleEntries = jsFiles.map((filePath) => {
    const relId = './' + path.relative(appWebDir, filePath).replace(/\\/g, '/');
    const source = fs.readFileSync(filePath, 'utf8');
    return `${JSON.stringify(relId)}: function(require, module, exports) {\n${source}\n}`;
  });

  const entryId = fs.existsSync(path.join(srcRoot, 'bootstrap.js'))
    ? './src/bootstrap.js'
    : './src/config/FrontendInitConfig.js';

  const bundleContent = `(function(globalScope) {
  'use strict';

  function fallbackUuid() {
    if (globalScope.crypto && typeof globalScope.crypto.randomUUID === 'function') {
      return globalScope.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  var builtins = {
    'node:crypto': { randomUUID: fallbackUuid },
    'crypto': { randomUUID: fallbackUuid }
  };

  var modules = {
${moduleEntries.join(',\n')}
  };

  var cache = {};

  function normalizeModulePath(fromId, request) {
    if (builtins[request]) return request;
    if (!request.startsWith('.')) return request;
    var baseParts = fromId.split('/').slice(0, -1);
    var reqParts = request.split('/');
    for (var i = 0; i < reqParts.length; i += 1) {
      var part = reqParts[i];
      if (!part || part === '.') continue;
      if (part === '..') {
        baseParts.pop();
      } else {
        baseParts.push(part);
      }
    }
    var joined = baseParts.join('/');
    if (!joined.startsWith('./')) joined = './' + joined;
    if (modules[joined]) return joined;
    if (modules[joined + '.js']) return joined + '.js';
    return joined;
  }

  function localRequire(fromId, request) {
    var resolved = normalizeModulePath(fromId, request);
    if (builtins[resolved]) return builtins[resolved];
    if (cache[resolved]) return cache[resolved].exports;
    var factory = modules[resolved];
    if (!factory) {
      throw new Error('Cannot find module ' + request + ' from ' + fromId);
    }
    var mod = { exports: {} };
    cache[resolved] = mod;
    factory(function(childReq) {
      return localRequire(resolved, childReq);
    }, mod, mod.exports);
    return mod.exports;
  }

  globalScope.AutonmaxBundle = {
    require: function(id) { return localRequire('./', id); }
  };
  localRequire('./', ${JSON.stringify(entryId)});
})(typeof window !== 'undefined' ? window : globalThis);
`;

  const bundlePath = path.join(distDir, 'app.bundle.js');
  fs.writeFileSync(bundlePath, bundleContent, 'utf8');
  return bundlePath;
}

/**
 * Builds the static SPA/PWA bundle into `app-web/dist` using native `node:fs` and `node:path`.
 * @param {{ appWebDir?: string, distDir?: string }} [options]
 * @returns {{ ok: boolean, distDir: string, filesCopied: number }}
 */
function buildWeb(options = {}) {
  const appWebDir = path.resolve(options.appWebDir || DEFAULT_APP_WEB_DIR);
  const distDir = path.resolve(options.distDir || path.join(appWebDir, 'dist'));

  if (!fs.existsSync(appWebDir)) {
    throw new Error(`app-web directory not found: ${appWebDir}`);
  }

  fs.rmSync(distDir, { recursive: true, force: true });
  let filesCopied = copyRecursive(appWebDir, distDir, distDir);
  if (writeBrowserBundle(appWebDir, distDir)) {
    filesCopied += 1;
  }

  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Build verification failed: missing ${indexPath}`);
  }

  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(indexPath));
  const distBundle = path.join(distDir, 'app.bundle.js');
  if (fs.existsSync(distBundle)) hash.update(fs.readFileSync(distBundle));
  const distCss = path.join(distDir, 'src', 'theme', 'tokens.css');
  if (fs.existsSync(distCss)) hash.update(fs.readFileSync(distCss));
  const buildId = hash.digest('hex').slice(0, 12);

  const distSwPath = path.join(distDir, 'sw.js');
  if (fs.existsSync(distSwPath)) {
    const swSrc = fs.readFileSync(distSwPath, 'utf8').replace(/__BUILD_ID__/g, buildId);
    fs.writeFileSync(distSwPath, swSrc, 'utf8');
  }

  const stampedIndex = fs
    .readFileSync(indexPath, 'utf8')
    .replace('./src/theme/tokens.css', `./src/theme/tokens.css?v=${buildId}`)
    .replace('./app.bundle.js', `./app.bundle.js?v=${buildId}`);
  fs.writeFileSync(indexPath, stampedIndex, 'utf8');

  return {
    ok: true,
    distDir,
    filesCopied,
    buildId,
  };
}

if (require.main === module) {
  const res = buildWeb();
  console.log(`[build:web] Built ${res.filesCopied} files into ${res.distDir}`);
}

module.exports = { buildWeb };
~~~~

### scripts/verify.js

- **Bloco:** Bloco 0 — Manifesto, Boot, Configuração & Scripts
- **Imports internos (`require` / `import`):** `core/ai/PromptPin`, `scripts/build_web`
- **Exports principais:** `runPromptPinCheck`, `runStaticBoundaryAudit`, `runWebBuildCheck`, `runContractTestSuite`
- **Total de linhas:** 165

~~~~javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PromptPin } = require('../core/ai/PromptPin');
const { buildWeb } = require('./build_web');

const VNEXT_ROOT = path.resolve(__dirname, '..');

function collectJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

function runPromptPinCheck() {
  const promptPin = new PromptPin();
  const res = promptPin.verifyAtBoot({ strict: true });
  console.log(`[verify 1/4] PromptPin OK (sha256=${res.sha256.slice(0, 16)}...)`);
}

function runStaticBoundaryAudit() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(VNEXT_ROOT, 'package.json'), 'utf8')
  );
  const allDeps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  const forbiddenDeps = [
    'better-sqlite3',
    'sqlite3',
    'puppeteer',
    'openai',
    '@google/generative-ai',
    'groq-sdk',
    '@anthropic-ai/sdk',
    'express',
    'fastify',
  ];
  for (const dep of forbiddenDeps) {
    if (Object.prototype.hasOwnProperty.call(allDeps, dep)) {
      throw new Error(`Forbidden dependency in package.json: ${dep}`);
    }
  }

  const coreJsFiles = collectJsFiles(path.join(VNEXT_ROOT, 'core'));
  const forbiddenImportRe =
    /\brequire\s*\(\s*['"](?:better-sqlite3|sqlite3|puppeteer|express|fastify|openai|@google\/generative-ai)['"]\s*\)/;
  const rawSqlRe =
    /\b(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i;

  for (const filePath of coreJsFiles) {
    const rel = path.relative(VNEXT_ROOT, filePath).replace(/\\/g, '/');
    const content = fs.readFileSync(filePath, 'utf8');

    if (forbiddenImportRe.test(content)) {
      throw new Error(`Forbidden require() found in ${rel}`);
    }

    const isRepoOrMigration =
      rel.startsWith('core/storage/repositories/') ||
      rel.startsWith('core/storage/migrations/');

    if (!isRepoOrMigration && rawSqlRe.test(content)) {
      throw new Error(`Raw SQL found outside repositories/migrations in ${rel}`);
    }
  }

  const uiDirs = [
    path.join(VNEXT_ROOT, 'app-web', 'src', 'views'),
    path.join(VNEXT_ROOT, 'app-web', 'src', 'components'),
  ];
  const hexColorRe = /#[0-9a-fA-F]{3,8}\b/;
  const runtimeImportRe = /@capacitor\/|indexedDB|localStorage/i;
  const fixedFontRe = /font-family\s*:(?!\s*var\(--)/i;

  for (const dir of uiDirs) {
    for (const filePath of collectJsFiles(dir)) {
      const rel = path.relative(VNEXT_ROOT, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf8');
      if (hexColorRe.test(content)) {
        throw new Error(`Hardcoded hex color found in ${rel}`);
      }
      if (runtimeImportRe.test(content)) {
        throw new Error(`Direct runtime/Capacitor/IDB reference found in ${rel}`);
      }
      if (fixedFontRe.test(content)) {
        throw new Error(`Hardcoded font-family found in ${rel}`);
      }
    }
  }

  console.log(
    `[verify 2/4] Static Boundary Audit OK (${coreJsFiles.length} core files checked)`
  );
}

function runWebBuildCheck() {
  const res = buildWeb();
  const distIndex = path.join(res.distDir, 'index.html');
  const distCss = path.join(res.distDir, 'src', 'theme', 'tokens.css');
  if (!fs.existsSync(distIndex) || !fs.existsSync(distCss)) {
    throw new Error('SPA build check failed: missing dist/index.html or tokens.css');
  }
  console.log(
    `[verify 3/4] Web Build OK (${res.filesCopied} files -> app-web/dist)`
  );
}

function runContractTestSuite() {
  const testFiles = [
    'tests/layer1_storage.test.js',
    'tests/layer2_domain.test.js',
    'tests/layer3_agent.test.js',
    'tests/layer4_messaging.test.js',
    'tests/layer5_gateway.test.js',
    'tests/layer6_offline_deploy.test.js',
  ];

  console.log('[verify 4/4] Running Layers 1..6 contract test suite...');
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: VNEXT_ROOT,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    throw new Error(`Test suite exited with status ${result.status}`);
  }
}

function main() {
  runPromptPinCheck();
  runStaticBoundaryAudit();
  runWebBuildCheck();
  runContractTestSuite();
  console.log('[verify] ALL CHECKS AND TESTS PASSED (exit 0)');
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('[verify] FAILED:', err.message);
    process.exitCode = process.exitCode || 1;
  }
}

module.exports = {
  runPromptPinCheck,
  runStaticBoundaryAudit,
  runWebBuildCheck,
  runContractTestSuite,
};
~~~~

## Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)

### core/storage/DatabaseManager.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** `core/storage/migrations`
- **Exports principais:** `DatabaseManager`, `DEFAULT_DB_PATH`
- **Total de linhas:** 318

~~~~javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { runMigrations, getAppliedMigrations } = require('./migrations');

const DEFAULT_DB_PATH = path.resolve(process.cwd(), 'workspace', 'autonmax.db');

/**
 * Manages the native node:sqlite DatabaseSync connection, mandatory PRAGMAs,
 * nested-safe transactions, versioned migrations, and clean WAL checkpoint shutdown.
 */
class DatabaseManager {
  /**
   * @param {{ dbPath?: string, autoMigrate?: boolean }} [options]
   */
  constructor(options = {}) {
    this.dbPath = options.dbPath || process.env.DB_PATH || DEFAULT_DB_PATH;
    this.autoMigrate = options.autoMigrate === true;
    /** @type {DatabaseSync | null} */
    this.db = null;
    this._txDepth = 0;
  }

  /**
   * Opens the SQLite connection and applies mandatory runtime PRAGMAs.
   * Safe to call multiple times (idempotent when already open).
   * @returns {DatabaseManager}
   */
  open() {
    if (this.db) {
      return this;
    }

    if (this.dbPath !== ':memory:' && !this.dbPath.startsWith('file:')) {
      const parentDir = path.dirname(path.resolve(this.dbPath));
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const db = new DatabaseSync(this.dbPath);
    try {
      this._applyPragmas(db);
      this.db = db;
      if (this.autoMigrate) {
        this.migrate();
      }
      return this;
    } catch (err) {
      try {
        db.close();
      } catch {
        // Ignore secondary close error on failed open.
      }
      this.db = null;
      throw err;
    }
  }

  /**
   * Convenience helper to open the database and run pending migrations.
   * @param {{ migrationsDir?: string }} [options]
   * @returns {{ applied: number[], skipped: number[], currentVersion: number }}
   */
  init(options = {}) {
    this.open();
    return this.migrate(options);
  }

  /**
   * Applies mandatory PRAGMAs on boot.
   * @param {DatabaseSync} db
   * @private
   */
  _applyPragmas(db) {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);
  }

  /**
   * Runs pending deterministic migrations tracked in schema_migrations.
   * @param {{ migrationsDir?: string }} [options]
   * @returns {{ applied: number[], skipped: number[], currentVersion: number }}
   */
  migrate(options = {}) {
    const db = this.getDb();
    return runMigrations(db, options);
  }

  /**
   * Returns applied schema migrations.
   * @returns {Array<{ version: number, applied_at: string }>}
   */
  getAppliedMigrations() {
    return getAppliedMigrations(this.getDb());
  }

  /**
   * Reads active PRAGMA settings from the open connection.
   * @returns {{ journal_mode: string, synchronous: number, foreign_keys: number, busy_timeout: number }}
   */
  getPragmas() {
    const db = this.getDb();
    const journalRow = db.prepare('PRAGMA journal_mode;').get();
    const syncRow = db.prepare('PRAGMA synchronous;').get();
    const fkRow = db.prepare('PRAGMA foreign_keys;').get();
    const busyRow = db.prepare('PRAGMA busy_timeout;').get();

    return {
      journal_mode: String(Object.values(journalRow)[0]),
      synchronous: Number(Object.values(syncRow)[0]),
      foreign_keys: Number(Object.values(fkRow)[0]),
      busy_timeout: Number(Object.values(busyRow)[0]),
    };
  }

  /**
   * Indicates whether the SQLite connection is currently open.
   * @returns {boolean}
   */
  isOpen() {
    return this.db !== null;
  }

  /**
   * Returns the underlying DatabaseSync instance or throws if closed.
   * @returns {DatabaseSync}
   */
  getDb() {
    if (!this.db) {
      throw new Error('DatabaseManager is not open. Call open() or init() first.');
    }
    return this.db;
  }

  /**
   * Executes a synchronous callback inside an atomic transaction.
   * Uses BEGIN IMMEDIATE at top level and SAVEPOINT for nested calls.
   * @template T
   * @param {(db: DatabaseSync) => T} fn
   * @returns {T}
   */
  transaction(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('transaction(fn) requires a function');
    }
    const db = this.getDb();
    const isOuter = this._txDepth === 0;
    const savepointName = `sp_tx_${this._txDepth}`;

    if (isOuter) {
      db.exec('BEGIN IMMEDIATE;');
    } else {
      db.exec(`SAVEPOINT ${savepointName};`);
    }

    this._txDepth += 1;
    try {
      const result = fn(db);
      if (isOuter) {
        db.exec('COMMIT;');
      } else {
        db.exec(`RELEASE SAVEPOINT ${savepointName};`);
      }
      return result;
    } catch (err) {
      try {
        if (isOuter) {
          db.exec('ROLLBACK;');
        } else {
          db.exec(`ROLLBACK TO SAVEPOINT ${savepointName};`);
          db.exec(`RELEASE SAVEPOINT ${savepointName};`);
        }
      } catch {
        // Ignore rollback failure if SQLite already rolled back.
      }
      throw err;
    } finally {
      this._txDepth -= 1;
    }
  }

  /**
   * Executes WAL checkpoint (TRUNCATE) and closes the database connection cleanly.
   * Safe to call multiple times.
   */
  close() {
    if (!this.db) {
      return;
    }

    const db = this.db;
    this.db = null;
    this._txDepth = 0;

    try {
      if (this.dbPath !== ':memory:') {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      }
    } finally {
      db.close();
    }
  }

  /**
   * Resolves a DatabaseSync instance from either a DatabaseManager or DatabaseSync.
   * @param {DatabaseManager | DatabaseSync} dbOrManager
   * @returns {DatabaseSync}
   */
  static resolveDb(dbOrManager) {
    if (!dbOrManager) {
      throw new Error('A DatabaseManager or DatabaseSync instance is required');
    }
    if (typeof dbOrManager.getDb === 'function') {
      return dbOrManager.getDb();
    }
    return dbOrManager;
  }

  /**
   * Runs a callback in a transaction whether given a DatabaseManager or DatabaseSync.
   * @template T
   * @param {DatabaseManager | DatabaseSync} dbOrManager
   * @param {(db: DatabaseSync) => T} fn
   * @returns {T}
   */
  static runInTransaction(dbOrManager, fn) {
    if (dbOrManager && typeof dbOrManager.transaction === 'function') {
      return dbOrManager.transaction(fn);
    }
    const db = DatabaseManager.resolveDb(dbOrManager);
    db.exec('BEGIN IMMEDIATE;');
    try {
      const res = fn(db);
      db.exec('COMMIT;');
      return res;
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback failure.
      }
      throw err;
    }
  }

  /**
   * Converts a node:sqlite null-prototype row into a plain object or null.
   * @param {Record<string, unknown> | undefined | null} row
   * @returns {Record<string, unknown> | null}
   */
  static toPlain(row) {
    return row ? { ...row } : null;
  }

  /**
   * Safely parses JSON text with a fallback value.
   * @template T
   * @param {string | null | undefined} value
   * @param {T} fallback
   * @returns {T}
   */
  static parseJson(value, fallback) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }
    if (typeof value !== 'string') {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  /**
   * Serializes a value to JSON unless already a string.
   * @param {unknown} value
   * @param {string} [fallback='{}']
   * @returns {string}
   */
  static stringifyJson(value, fallback = '{}') {
    if (value === undefined) return fallback;
    if (value === null) return null;
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }

  /**
   * Sanitizes identifiers before any NTFS/local filesystem usage.
   * @param {string} rawKey
   * @returns {string}
   */
  static sanitizeKey(rawKey) {
    return String(rawKey || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Extracts an optional partnerId from either a string or options object.
   * @param {string | { partnerId?: string, partner_id?: string } | undefined} options
   * @returns {string | null}
   */
  static extractPartnerId(options) {
    if (typeof options === 'string') return options || null;
    if (options && typeof options === 'object') {
      return options.partnerId ?? options.partner_id ?? null;
    }
    return null;
  }
}

module.exports = { DatabaseManager, DEFAULT_DB_PATH };
~~~~

### core/storage/migrations/001_initial_schema.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `version`, `name`
- **Total de linhas:** 204

~~~~javascript
'use strict';

/**
 * Migration 001: Initial unified SQLite schema for AUTONMAX vNext.
 * Defines core tables, foreign keys, check constraints, and indexes.
 */
const SQL = `
-- Parceiros / Estabelecimentos
CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  store_segment TEXT,
  is_active INTEGER DEFAULT 1,
  personality_prompt TEXT,
  business_rules TEXT,
  working_hours_json TEXT,
  policies_json TEXT,
  welcome_message TEXT DEFAULT 'Olá! Como posso te ajudar hoje?',
  pdf_files_json TEXT DEFAULT '[]',
  image_files_json TEXT DEFAULT '[]',
  owner_jid TEXT,
  feature_flags_json TEXT DEFAULT '{"bookings":true,"orders":true,"voiceStt":true,"voiceTts":false,"googleCalendar":false,"webhooks":false,"softPause":true,"ownerCommands":true}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessões de Usuários Administrativos / Painel
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Catálogo de Produtos e Serviços
CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('SERVICE', 'PRODUCT')),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  duration_minutes INTEGER DEFAULT 30,
  category TEXT DEFAULT 'geral',
  active INTEGER DEFAULT 1,
  version_hash TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Clientes Finais (CRM)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT,
  phone TEXT,
  facts_json TEXT DEFAULT '{}',
  visits_count INTEGER DEFAULT 0,
  last_seen_at DATETIME,
  UNIQUE(partner_id, channel, external_id)
);

-- Conversas Ativas e Estado de Transbordo Humano
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL,
  external_chat_id TEXT NOT NULL,
  is_paused INTEGER DEFAULT 0,
  human_requested INTEGER DEFAULT 0,
  paused_context_json TEXT DEFAULT '[]',
  last_message_at DATETIME,
  UNIQUE(partner_id, channel, external_chat_id)
);

-- Histórico Detalhado de Mensagens (Auditoria e Janela de Tokens)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  partner_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('INBOUND', 'OUTBOUND')),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'operator', 'system')),
  content_type TEXT DEFAULT 'text',
  content TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agendamentos de Serviços
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id),
  catalog_item_id TEXT NOT NULL REFERENCES catalog_items(id),
  item_name_snapshot TEXT NOT NULL,
  price_cents_snapshot INTEGER NOT NULL,
  duration_minutes_snapshot INTEGER NOT NULL,
  client_name TEXT NOT NULL,
  customer_phone TEXT,
  date_str TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED')),
  idempotency_key TEXT UNIQUE,
  external_calendar_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Índice Único Parcial anti-Double Booking para Agendamentos
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_slot
ON appointments(partner_id, date_str, time_slot)
WHERE status = 'CONFIRMED';

-- Pedidos de Produtos
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id),
  client_name TEXT NOT NULL,
  customer_phone TEXT,
  items_json TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  payment_method TEXT,
  delivery_type TEXT,
  address TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED', 'CANCELLED', 'DELIVERED')),
  idempotency_key TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Idempotência de Eventos Recebidos
CREATE TABLE IF NOT EXISTS processed_events (
  event_key TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Fila de Envio Outbound (Persistência Durável)
CREATE TABLE IF NOT EXISTS outbox_queue (
  id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'FAILED')),
  attempts INTEGER DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Lembretes Agendados
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Log Unificado de Auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id TEXT,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Integrações de Parceiros
CREATE TABLE IF NOT EXISTS partner_integrations (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  credentials_json TEXT NOT NULL,
  expires_at INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, provider)
);

-- Índices Adicionais de Leitura
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_status_next ON outbox_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_appointments_partner_date ON appointments(partner_id, date_str);
CREATE INDEX IF NOT EXISTS idx_orders_partner_created ON orders(partner_id, created_at);
`;

module.exports = {
  version: 1,
  name: '001_initial_schema',
  up(db) {
    db.exec(SQL);
  },
};
~~~~

### core/storage/migrations/002_partner_profile_extensions.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `version`, `name`
- **Total de linhas:** 18

~~~~javascript
'use strict';

/**
 * Migration 002: Extends `partners` table with `logo_data_url` for PME branding.
 * Idempotent via `PRAGMA table_info(partners)` inspection before `ALTER TABLE`.
 */
module.exports = {
  version: 2,
  name: '002_partner_profile_extensions',
  up(db) {
    const columns = db.prepare('PRAGMA table_info(partners)').all();
    const hasLogo = columns.some((col) => col.name === 'logo_data_url');
    if (!hasLogo) {
      db.exec('ALTER TABLE partners ADD COLUMN logo_data_url TEXT;');
    }
  },
};
~~~~

### core/storage/migrations/003_catalog_stock_control.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `version`, `name`
- **Total de linhas:** 21

~~~~javascript
'use strict';

/**
 * Migration 003: Adds `track_stock` and `stock_quantity` columns to `catalog_items`
 * so digital/software products can disable stock limits (`track_stock = 0`).
 */
module.exports = {
  version: 3,
  name: '003_catalog_stock_control',
  up(db) {
    const columns = db.prepare('PRAGMA table_info(catalog_items)').all();
    const names = new Set(columns.map((c) => c.name));
    if (!names.has('track_stock')) {
      db.exec('ALTER TABLE catalog_items ADD COLUMN track_stock INTEGER DEFAULT 0;');
    }
    if (!names.has('stock_quantity')) {
      db.exec('ALTER TABLE catalog_items ADD COLUMN stock_quantity INTEGER DEFAULT NULL;');
    }
  },
};
~~~~

### core/storage/migrations/index.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `ensureMigrationsTable`, `loadMigrations`, `getAppliedMigrations`, `runMigrations`
- **Total de linhas:** 131

~~~~javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_FILE_RE = /^(\d+)_(.+)\.js$/;

/**
 * Ensures the schema_migrations tracking table exists.
 * @param {import('node:sqlite').DatabaseSync} db
 */
function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Loads and validates all versioned migration scripts deterministically.
 * @param {string} [migrationsDir]
 * @returns {Array<{ version: number, name: string, up: Function }>}
 */
function loadMigrations(migrationsDir = __dirname) {
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const migrations = [];
  const seenVersions = new Set();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = MIGRATION_FILE_RE.exec(entry.name);
    if (!match) continue;

    const fileVersion = Number(match[1]);
    const fullPath = path.join(migrationsDir, entry.name);
    const mod = require(fullPath);

    const version = Number.isInteger(mod.version) ? mod.version : fileVersion;
    const name = mod.name || `${match[1]}_${match[2]}`;

    if (!Number.isInteger(version) || version <= 0) {
      throw new Error(`Invalid migration version in ${entry.name}: ${version}`);
    }
    if (typeof mod.up !== 'function') {
      throw new Error(`Migration ${entry.name} must export an up(db) function`);
    }
    if (seenVersions.has(version)) {
      throw new Error(`Duplicate migration version detected: ${version}`);
    }

    seenVersions.add(version);
    migrations.push({ version, name, up: mod.up });
  }

  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}

/**
 * Returns the list of already-applied migration records ordered by version.
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Array<{ version: number, applied_at: string }>}
 */
function getAppliedMigrations(db) {
  ensureMigrationsTable(db);
  return db
    .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version ASC')
    .all()
    .map((row) => ({ ...row }));
}

/**
 * Runs all pending migrations atomically inside individual transactions.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ migrationsDir?: string }} [options]
 * @returns {{ applied: number[], skipped: number[], currentVersion: number }}
 */
function runMigrations(db, options = {}) {
  ensureMigrationsTable(db);

  const migrations = loadMigrations(options.migrationsDir || __dirname);
  const appliedSet = new Set(
    getAppliedMigrations(db).map((row) => Number(row.version))
  );

  const applied = [];
  const skipped = [];

  for (const migration of migrations) {
    if (appliedSet.has(migration.version)) {
      skipped.push(migration.version);
      continue;
    }

    db.exec('BEGIN IMMEDIATE;');
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(
        migration.version
      );
      db.exec('COMMIT;');
      applied.push(migration.version);
      appliedSet.add(migration.version);
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback failure if SQLite already rolled back the statement.
      }
      throw new Error(
        `Migration v${migration.version} (${migration.name}) failed: ${err.message}`,
        { cause: err }
      );
    }
  }

  const currentVersion =
    appliedSet.size > 0 ? Math.max(...Array.from(appliedSet)) : 0;

  return { applied, skipped, currentVersion };
}

module.exports = {
  ensureMigrationsTable,
  loadMigrations,
  getAppliedMigrations,
  runMigrations,
};
~~~~

### core/storage/repositories/AppointmentRepository.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** `core/storage/DatabaseManager`
- **Exports principais:** `AppointmentRepository`
- **Total de linhas:** 374

~~~~javascript
'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

const VALID_APPOINTMENT_STATUSES = new Set(['CONFIRMED', 'CANCELLED', 'COMPLETED']);

/**
 * Repository for service appointments (`appointments`) and reminders (`reminders`).
 * Enforces atomic double-booking protection via `idx_appointments_unique_slot`
 * and preserves historical catalog snapshots.
 */
class AppointmentRepository {
  /**
   * @param {DatabaseManager | import('node:sqlite').DatabaseSync} dbOrManager
   */
  constructor(dbOrManager) {
    this.dbOrManager = dbOrManager;
  }

  /**
   * @private
   */
  _db() {
    return DatabaseManager.resolveDb(this.dbOrManager);
  }

  /**
   * Creates an appointment inside an atomic BEGIN IMMEDIATE transaction.
   * When snapshot fields are omitted, resolves and snapshots them from `catalog_items`
   * (requiring an active SERVICE item).
   * @param {Record<string, unknown>} data
   */
  create(data) {
    const id = data.id || crypto.randomUUID();
    const partnerId = data.partnerId ?? data.partner_id;
    const customerId = data.customerId ?? data.customer_id ?? null;
    const catalogItemId = data.catalogItemId ?? data.catalog_item_id;
    const clientName = String(data.clientName ?? data.client_name ?? '').trim();
    const customerPhone = data.customerPhone ?? data.customer_phone ?? null;
    const dateStr = String(data.dateStr ?? data.date_str ?? '').trim();
    const timeSlot = String(data.timeSlot ?? data.time_slot ?? '').trim();
    const status = String(data.status || 'CONFIRMED').toUpperCase();
    const idempotencyKey = data.idempotencyKey ?? data.idempotency_key ?? null;
    const externalCalendarId =
      data.externalCalendarId ?? data.external_calendar_id ?? null;

    if (!partnerId || !catalogItemId || !clientName || !dateStr || !timeSlot) {
      throw new Error(
        'AppointmentRepository.create requires partnerId, catalogItemId, clientName, dateStr, and timeSlot'
      );
    }
    if (!VALID_APPOINTMENT_STATUSES.has(status)) {
      throw new Error(`Invalid appointment status: ${status}`);
    }

    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      let itemNameSnapshot = data.itemNameSnapshot ?? data.item_name_snapshot;
      let priceCentsSnapshot =
        data.priceCentsSnapshot ?? data.price_cents_snapshot;
      let durationMinutesSnapshot =
        data.durationMinutesSnapshot ?? data.duration_minutes_snapshot;

      if (
        itemNameSnapshot === undefined ||
        priceCentsSnapshot === undefined ||
        durationMinutesSnapshot === undefined
      ) {
        const catalogItem = DatabaseManager.toPlain(
          db
            .prepare('SELECT * FROM catalog_items WHERE id = ? AND partner_id = ?')
            .get(catalogItemId, partnerId)
        );
        if (!catalogItem) {
          throw new Error(`Catalog item not found: ${catalogItemId}`);
        }
        if (Number(catalogItem.active) !== 1) {
          throw new Error(`Catalog item is inactive: ${catalogItemId}`);
        }
        if (catalogItem.item_type !== 'SERVICE') {
          throw new Error(
            `Cannot book non-SERVICE catalog item: ${catalogItemId} (${catalogItem.item_type})`
          );
        }

        itemNameSnapshot = itemNameSnapshot ?? catalogItem.name;
        priceCentsSnapshot =
          priceCentsSnapshot ?? Number(catalogItem.price_cents);
        durationMinutesSnapshot =
          durationMinutesSnapshot ?? Number(catalogItem.duration_minutes);
      }

      db.prepare(
        `INSERT INTO appointments (
          id, partner_id, customer_id, catalog_item_id,
          item_name_snapshot, price_cents_snapshot, duration_minutes_snapshot,
          client_name, customer_phone, date_str, time_slot, status,
          idempotency_key, external_calendar_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        partnerId,
        customerId,
        catalogItemId,
        String(itemNameSnapshot),
        Number(priceCentsSnapshot),
        Number(durationMinutesSnapshot),
        clientName,
        customerPhone,
        dateStr,
        timeSlot,
        status,
        idempotencyKey,
        externalCalendarId
      );

      return DatabaseManager.toPlain(
        db.prepare('SELECT * FROM appointments WHERE id = ?').get(id)
      );
    });
  }

  /**
   * Finds an appointment by primary key, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  findById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare('SELECT * FROM appointments WHERE id = ? AND partner_id = ?')
          .get(id, partnerId)
      : this._db().prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    return DatabaseManager.toPlain(row);
  }

  /**
   * Finds an appointment by idempotency key, optionally scoped by `partnerId`.
   * @param {string} idempotencyKey
   * @param {string | { partnerId?: string }} [options]
   */
  findByIdempotencyKey(idempotencyKey, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare(
            'SELECT * FROM appointments WHERE idempotency_key = ? AND partner_id = ?'
          )
          .get(idempotencyKey, partnerId)
      : this._db()
          .prepare('SELECT * FROM appointments WHERE idempotency_key = ?')
          .get(idempotencyKey);
    return DatabaseManager.toPlain(row);
  }

  /**
   * Lists appointments for a partner, optionally filtered by `dateStr` and `status`.
   * @param {string} partnerId
   * @param {{ dateStr?: string, status?: string, limit?: number }} [options]
   */
  listByPartner(partnerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 200;
    const clauses = ['partner_id = ?'];
    const params = [partnerId];

    if (options.dateStr) {
      clauses.push('date_str = ?');
      params.push(String(options.dateStr));
    }
    if (options.status) {
      clauses.push('status = ?');
      params.push(String(options.status).toUpperCase());
    }
    params.push(limit);

    return this._db()
      .prepare(
        `SELECT * FROM appointments
         WHERE ${clauses.join(' AND ')}
         ORDER BY date_str ASC, time_slot ASC, id ASC
         LIMIT ?`
      )
      .all(...params)
      .map(DatabaseManager.toPlain);
  }

  /**
   * Lists appointments for a partner on a given date.
   * @param {string} partnerId
   * @param {string} dateStr
   * @param {{ status?: string }} [options]
   */
  listByPartnerAndDate(partnerId, dateStr, options = {}) {
    if (options.status) {
      return this._db()
        .prepare(
          `SELECT * FROM appointments
           WHERE partner_id = ? AND date_str = ? AND status = ?
           ORDER BY time_slot ASC, id ASC`
        )
        .all(partnerId, dateStr, String(options.status).toUpperCase())
        .map(DatabaseManager.toPlain);
    }

    return this._db()
      .prepare(
        `SELECT * FROM appointments
         WHERE partner_id = ? AND date_str = ?
         ORDER BY time_slot ASC, id ASC`
      )
      .all(partnerId, dateStr)
      .map(DatabaseManager.toPlain);
  }

  /**
   * Lists appointments for a customer, optionally scoped by `partnerId`.
   * @param {string} customerId
   * @param {{ limit?: number, partnerId?: string }} [options]
   */
  listByCustomer(customerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const partnerId = DatabaseManager.extractPartnerId(options);
    const sql = partnerId
      ? `SELECT * FROM appointments
         WHERE customer_id = ? AND partner_id = ?
         ORDER BY date_str DESC, time_slot DESC
         LIMIT ?`
      : `SELECT * FROM appointments
         WHERE customer_id = ?
         ORDER BY date_str DESC, time_slot DESC
         LIMIT ?`;
    const params = partnerId ? [customerId, partnerId, limit] : [customerId, limit];
    return this._db()
      .prepare(sql)
      .all(...params)
      .map(DatabaseManager.toPlain);
  }

  /**
   * Updates appointment status and optional external_calendar_id.
   * Optionally scoped by `partnerId`.
   * @param {string} id
   * @param {'CONFIRMED' | 'CANCELLED' | 'COMPLETED'} status
   * @param {{ externalCalendarId?: string, partnerId?: string }} [options]
   */
  updateStatus(id, status, options = {}) {
    const normalized = String(status).toUpperCase();
    if (!VALID_APPOINTMENT_STATUSES.has(normalized)) {
      throw new Error(`Invalid appointment status: ${status}`);
    }
    const partnerId = DatabaseManager.extractPartnerId(options);
    const whereClause = partnerId ? 'id = ? AND partner_id = ?' : 'id = ?';

    if (options.externalCalendarId !== undefined) {
      const params = [normalized, options.externalCalendarId, id];
      if (partnerId) params.push(partnerId);
      this._db()
        .prepare(
          `UPDATE appointments
           SET status = ?, external_calendar_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE ${whereClause}`
        )
        .run(...params);
    } else {
      const params = [normalized, id];
      if (partnerId) params.push(partnerId);
      this._db()
        .prepare(
          `UPDATE appointments
           SET status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE ${whereClause}`
        )
        .run(...params);
    }

    return this.findById(id, { partnerId });
  }

  /**
   * Cancels an appointment, releasing its unique confirmed slot.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  cancel(id, options = {}) {
    return this.updateStatus(id, 'CANCELLED', options);
  }

  /**
   * Marks an appointment as completed.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  complete(id, options = {}) {
    return this.updateStatus(id, 'COMPLETED', options);
  }

  /**
   * Schedules a reminder linked to an appointment.
   * @param {{ id?: string, partnerId: string, appointmentId: string, recipientId: string, fireAt: number, status?: string }} data
   */
  createReminder(data) {
    const id = data.id || crypto.randomUUID();
    const partnerId = data.partnerId ?? data.partner_id;
    const appointmentId = data.appointmentId ?? data.appointment_id;
    const recipientId = data.recipientId ?? data.recipient_id;
    const fireAt = Number(data.fireAt ?? data.fire_at);
    const status = String(data.status || 'PENDING');

    this._db()
      .prepare(
        `INSERT INTO reminders (id, partner_id, appointment_id, recipient_id, fire_at, status)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, partnerId, appointmentId, recipientId, Math.trunc(fireAt), status);

    return DatabaseManager.toPlain(
      this._db().prepare('SELECT * FROM reminders WHERE id = ?').get(id)
    );
  }

  /**
   * Lists pending reminders due on or before `beforeMs`.
   * Optionally scoped by `partnerId`.
   * @param {number} [beforeMs]
   * @param {string | { partnerId?: string }} [options]
   */
  listPendingReminders(beforeMs = Date.now(), options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const sql = partnerId
      ? `SELECT * FROM reminders
         WHERE status = 'PENDING' AND fire_at <= ? AND partner_id = ?
         ORDER BY fire_at ASC`
      : `SELECT * FROM reminders
         WHERE status = 'PENDING' AND fire_at <= ?
         ORDER BY fire_at ASC`;
    const params = partnerId
      ? [Math.trunc(beforeMs), partnerId]
      : [Math.trunc(beforeMs)];
    return this._db()
      .prepare(sql)
      .all(...params)
      .map(DatabaseManager.toPlain);
  }

  /**
   * Updates reminder status, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string} status
   * @param {string | { partnerId?: string }} [options]
   */
  markReminderStatus(id, status, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    if (partnerId) {
      this._db()
        .prepare('UPDATE reminders SET status = ? WHERE id = ? AND partner_id = ?')
        .run(String(status), id, partnerId);
      return DatabaseManager.toPlain(
        this._db()
          .prepare('SELECT * FROM reminders WHERE id = ? AND partner_id = ?')
          .get(id, partnerId)
      );
    }
    this._db()
      .prepare('UPDATE reminders SET status = ? WHERE id = ?')
      .run(String(status), id);
    return DatabaseManager.toPlain(
      this._db().prepare('SELECT * FROM reminders WHERE id = ?').get(id)
    );
  }
}

module.exports = { AppointmentRepository };
~~~~

### core/storage/repositories/AuthRepository.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** `core/storage/DatabaseManager`
- **Exports principais:** `AuthRepository`
- **Total de linhas:** 132

~~~~javascript
'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

/**
 * Repository for administrative panel user sessions (`user_sessions`).
 */
class AuthRepository {
  /**
   * @param {DatabaseManager | import('node:sqlite').DatabaseSync} dbOrManager
   */
  constructor(dbOrManager) {
    this.dbOrManager = dbOrManager;
  }

  /**
   * @private
   */
  _db() {
    return DatabaseManager.resolveDb(this.dbOrManager);
  }

  /**
   * Computes a deterministic SHA-256 hex digest for a raw session token.
   * @param {string} rawToken
   * @returns {string}
   */
  static hashToken(rawToken) {
    return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
  }

  /**
   * Persists a new administrative session. Accepts either `tokenHash` or raw `token`.
   * @param {{ tokenHash?: string, token?: string, partnerId: string, expiresAt: number }} data
   */
  createSession(data) {
    const partnerId = data.partnerId ?? data.partner_id;
    const expiresAt = Number(data.expiresAt ?? data.expires_at);
    const tokenHash =
      data.tokenHash ??
      data.token_hash ??
      (data.token ? AuthRepository.hashToken(data.token) : null);

    if (!tokenHash || !partnerId || !Number.isFinite(expiresAt)) {
      throw new Error(
        'AuthRepository.createSession requires token/tokenHash, partnerId, and expiresAt'
      );
    }

    this._db()
      .prepare(
        `INSERT INTO user_sessions (token_hash, partner_id, expires_at)
         VALUES (?, ?, ?)`
      )
      .run(tokenHash, partnerId, Math.trunc(expiresAt));

    return this.findSessionByTokenHash(tokenHash);
  }

  /**
   * Finds a session by token hash regardless of expiration.
   * @param {string} tokenHash
   */
  findSessionByTokenHash(tokenHash) {
    const row = this._db()
      .prepare('SELECT * FROM user_sessions WHERE token_hash = ?')
      .get(tokenHash);
    return DatabaseManager.toPlain(row);
  }

  /**
   * Finds a session by raw token regardless of expiration.
   * @param {string} rawToken
   */
  findSessionByToken(rawToken) {
    return this.findSessionByTokenHash(AuthRepository.hashToken(rawToken));
  }

  /**
   * Finds a non-expired session by token hash.
   * @param {string} tokenHash
   * @param {number} [nowMs]
   */
  findValidSession(tokenHash, nowMs = Date.now()) {
    const row = this._db()
      .prepare(
        'SELECT * FROM user_sessions WHERE token_hash = ? AND expires_at > ?'
      )
      .get(tokenHash, Math.trunc(nowMs));
    return DatabaseManager.toPlain(row);
  }

  /**
   * Deletes a single session by token hash.
   * @param {string} tokenHash
   * @returns {boolean}
   */
  deleteSession(tokenHash) {
    const info = this._db()
      .prepare('DELETE FROM user_sessions WHERE token_hash = ?')
      .run(tokenHash);
    return info.changes > 0;
  }

  /**
   * Revokes all sessions belonging to a partner.
   * @param {string} partnerId
   * @returns {number}
   */
  deletePartnerSessions(partnerId) {
    const info = this._db()
      .prepare('DELETE FROM user_sessions WHERE partner_id = ?')
      .run(partnerId);
    return info.changes;
  }

  /**
   * Purges all expired sessions up to `nowMs`.
   * @param {number} [nowMs]
   * @returns {number}
   */
  purgeExpiredSessions(nowMs = Date.now()) {
    const info = this._db()
      .prepare('DELETE FROM user_sessions WHERE expires_at <= ?')
      .run(Math.trunc(nowMs));
    return info.changes;
  }
}

module.exports = { AuthRepository };
~~~~

### core/storage/repositories/CatalogRepository.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** `core/storage/DatabaseManager`
- **Exports principais:** `CatalogRepository`, `computeVersionHash`
- **Total de linhas:** 346

~~~~javascript
'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

const VALID_ITEM_TYPES = new Set(['SERVICE', 'PRODUCT']);

/**
 * Computes canonical SHA-256 hash for a catalog item:
 * SHA256(id|item_type|name|description|price_cents|duration_minutes)
 * @param {{ id: string, itemType: string, name: string, description: string, priceCents: number, durationMinutes: number }} fields
 * @returns {string}
 */
function computeVersionHash({
  id,
  itemType,
  name,
  description,
  priceCents,
  durationMinutes,
}) {
  const canonical = `${id}|${itemType}|${name}|${description}|${priceCents}|${durationMinutes}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Repository for catalog products and services (`catalog_items`) with canonical
 * SHA-256 version hashing and soft-delete preservation.
 */
class CatalogRepository {
  /**
   * @param {DatabaseManager | import('node:sqlite').DatabaseSync} dbOrManager
   */
  constructor(dbOrManager) {
    this.dbOrManager = dbOrManager;
  }

  /**
   * @private
   */
  _db() {
    return DatabaseManager.resolveDb(this.dbOrManager);
  }

  /**
   * Exposes canonical version hash computation.
   */
  static computeVersionHash(fields) {
    return computeVersionHash({
      id: fields.id,
      itemType: fields.itemType ?? fields.item_type,
      name: fields.name,
      description: fields.description ?? '',
      priceCents: fields.priceCents ?? fields.price_cents,
      durationMinutes: fields.durationMinutes ?? fields.duration_minutes ?? 30,
    });
  }

  /**
   * Creates a new catalog item and computes its canonical version_hash.
   * @param {Record<string, unknown>} data
   */
  create(data) {
    const id = data.id || crypto.randomUUID();
    const partnerId = data.partnerId ?? data.partner_id;
    const itemType = String((data.itemType ?? data.item_type) || '').toUpperCase();
    const name = String(data.name || '').trim();
    const description = String(data.description ?? '');
    const priceCents = Number(data.priceCents ?? data.price_cents);
    const durationMinutes =
      data.durationMinutes !== undefined
        ? Number(data.durationMinutes)
        : data.duration_minutes !== undefined
          ? Number(data.duration_minutes)
          : 30;
    const category = String(data.category ?? 'geral');
    const active =
      data.active !== undefined ? Number(Boolean(data.active)) : 1;
    const trackStock = Number(
      Boolean(data.trackStock ?? data.track_stock ?? false)
    );
    const rawStockQty = data.stockQuantity ?? data.stock_quantity;
    const stockQuantity =
      trackStock === 1 && rawStockQty !== null && rawStockQty !== undefined && rawStockQty !== ''
        ? Math.max(0, Math.floor(Number(rawStockQty) || 0))
        : trackStock === 1
          ? 0
          : null;

    if (!partnerId || !name) {
      throw new Error('CatalogRepository.create requires partnerId and name');
    }
    if (!VALID_ITEM_TYPES.has(itemType)) {
      throw new Error(`Invalid item_type: ${itemType}. Expected SERVICE or PRODUCT`);
    }
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      throw new Error(`price_cents must be a non-negative integer, got: ${priceCents}`);
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new Error(`duration_minutes must be a positive integer, got: ${durationMinutes}`);
    }

    const versionHash = computeVersionHash({
      id,
      itemType,
      name,
      description,
      priceCents,
      durationMinutes,
    });

    this._db()
      .prepare(
        `INSERT INTO catalog_items (
          id, partner_id, item_type, name, description,
          price_cents, duration_minutes, category, active, version_hash,
          track_stock, stock_quantity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        partnerId,
        itemType,
        name,
        description,
        priceCents,
        durationMinutes,
        category,
        active,
        versionHash,
        trackStock,
        stockQuantity
      );

    return this.findById(id);
  }

  /**
   * Finds a catalog item by id (includes inactive items by default).
   * Optionally scopes lookup by `partnerId`.
   * @param {string} id
   * @param {string | { includeInactive?: boolean, partnerId?: string }} [options]
   */
  findById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const includeInactive =
      typeof options === 'object' && options !== null
        ? options.includeInactive !== false
        : true;
    const clauses = ['id = ?'];
    const params = [id];
    if (!includeInactive) {
      clauses.push('active = 1');
    }
    if (partnerId) {
      clauses.push('partner_id = ?');
      params.push(partnerId);
    }
    const row = this._db()
      .prepare(`SELECT * FROM catalog_items WHERE ${clauses.join(' AND ')}`)
      .get(...params);
    return DatabaseManager.toPlain(row);
  }

  /**
   * Finds an active catalog item by id.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  findActiveById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    return this.findById(id, { includeInactive: false, partnerId });
  }

  /**
   * Lists catalog items for a partner. Defaults to active items only.
   * @param {string} partnerId
   * @param {{ includeInactive?: boolean, itemType?: string, category?: string }} [options]
   */
  listByPartner(partnerId, options = {}) {
    const clauses = ['partner_id = ?'];
    const params = [partnerId];

    if (!options.includeInactive) {
      clauses.push('active = 1');
    }
    if (options.itemType) {
      clauses.push('item_type = ?');
      params.push(String(options.itemType).toUpperCase());
    }
    if (options.category) {
      clauses.push('category = ?');
      params.push(String(options.category));
    }

    const sql = `SELECT * FROM catalog_items WHERE ${clauses.join(' AND ')} ORDER BY name ASC, id ASC`;
    return this._db()
      .prepare(sql)
      .all(...params)
      .map(DatabaseManager.toPlain);
  }

  /**
   * Updates a catalog item and recomputes its canonical version_hash.
   * Does not alter historical appointment/order snapshots.
   * @param {string} id
   * @param {Record<string, unknown>} patch
   * @param {string | { partnerId?: string }} [options]
   */
  update(id, patch = {}, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      const existing = DatabaseManager.toPlain(
        partnerId
          ? db
              .prepare('SELECT * FROM catalog_items WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id)
      );
      if (!existing) {
        return null;
      }

      const itemType = String(
        patch.itemType ?? patch.item_type ?? existing.item_type
      ).toUpperCase();
      const name = String(patch.name ?? existing.name).trim();
      const description = String(patch.description ?? existing.description ?? '');
      const priceCents = Number(
        patch.priceCents ?? patch.price_cents ?? existing.price_cents
      );
      const durationMinutes = Number(
        patch.durationMinutes ?? patch.duration_minutes ?? existing.duration_minutes
      );
      const category = String(patch.category ?? existing.category);
      const active =
        patch.active !== undefined ? Number(Boolean(patch.active)) : existing.active;

      if (!VALID_ITEM_TYPES.has(itemType)) {
        throw new Error(`Invalid item_type: ${itemType}`);
      }
      if (!name) {
        throw new Error('Catalog item name cannot be empty');
      }
      if (!Number.isInteger(priceCents) || priceCents < 0) {
        throw new Error(`price_cents must be a non-negative integer, got: ${priceCents}`);
      }
      if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
        throw new Error(
          `duration_minutes must be a positive integer, got: ${durationMinutes}`
        );
      }

      const versionHash = computeVersionHash({
        id,
        itemType,
        name,
        description,
        priceCents,
        durationMinutes,
      });

      const trackStock =
        patch.trackStock !== undefined || patch.track_stock !== undefined
          ? Number(Boolean(patch.trackStock ?? patch.track_stock))
          : Number(existing.track_stock ?? 0);
      const rawStockQty =
        patch.stockQuantity !== undefined || patch.stock_quantity !== undefined
          ? patch.stockQuantity ?? patch.stock_quantity
          : existing.stock_quantity;
      const stockQuantity =
        trackStock === 1 && rawStockQty !== null && rawStockQty !== undefined && rawStockQty !== ''
          ? Math.max(0, Math.floor(Number(rawStockQty) || 0))
          : trackStock === 1
            ? 0
            : null;

      const updateSql = partnerId
        ? `UPDATE catalog_items
           SET item_type = ?, name = ?, description = ?, price_cents = ?,
               duration_minutes = ?, category = ?, active = ?, version_hash = ?,
               track_stock = ?, stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND partner_id = ?`
        : `UPDATE catalog_items
           SET item_type = ?, name = ?, description = ?, price_cents = ?,
               duration_minutes = ?, category = ?, active = ?, version_hash = ?,
               track_stock = ?, stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`;
      const updateParams = [
        itemType,
        name,
        description,
        priceCents,
        durationMinutes,
        category,
        active,
        versionHash,
        trackStock,
        stockQuantity,
        id,
      ];
      if (partnerId) updateParams.push(partnerId);

      db.prepare(updateSql).run(...updateParams);

      return DatabaseManager.toPlain(
        partnerId
          ? db
              .prepare('SELECT * FROM catalog_items WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id)
      );
    });
  }

  /**
   * Soft-deletes (deactivates) a catalog item without breaking FK references
   * or historical appointment/order snapshots.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  softDelete(id, options = {}) {
    return this.update(id, { active: false }, options);
  }

  /**
   * Alias for softDelete.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  deactivate(id, options = {}) {
    return this.softDelete(id, options);
  }

  /**
   * Re-activates a soft-deleted catalog item.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  activate(id, options = {}) {
    return this.update(id, { active: true }, options);
  }
}

module.exports = { CatalogRepository, computeVersionHash };
~~~~

### core/storage/repositories/ConversationRepository.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** `core/storage/DatabaseManager`
- **Exports principais:** `ConversationRepository`
- **Total de linhas:** 384

~~~~javascript
'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

/**
 * Normalizes a conversation row with parsed paused_context array.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydrateConversation(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    is_paused: Number(plain.is_paused || 0),
    human_requested: Number(plain.human_requested || 0),
    paused_context: DatabaseManager.parseJson(plain.paused_context_json, []),
  };
}

/**
 * Normalizes a message row with parsed metadata object.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydrateMessage(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    metadata: DatabaseManager.parseJson(plain.metadata_json, {}),
  };
}

/**
 * Repository for conversations (`conversations`), soft-pause state,
 * and detailed message history (`messages`).
 */
class ConversationRepository {
  /**
   * @param {DatabaseManager | import('node:sqlite').DatabaseSync} dbOrManager
   */
  constructor(dbOrManager) {
    this.dbOrManager = dbOrManager;
  }

  /**
   * @private
   */
  _db() {
    return DatabaseManager.resolveDb(this.dbOrManager);
  }

  /**
   * Creates or returns an existing conversation for (partner_id, channel, external_chat_id).
   * @param {Record<string, unknown>} data
   */
  upsertConversation(data) {
    const partnerId = data.partnerId ?? data.partner_id;
    const customerId = data.customerId ?? data.customer_id;
    const channel = String(data.channel || '').trim();
    const externalChatId = String(
      data.externalChatId ?? data.external_chat_id ?? ''
    ).trim();

    if (!partnerId || !customerId || !channel || !externalChatId) {
      throw new Error(
        'ConversationRepository.upsertConversation requires partnerId, customerId, channel, and externalChatId'
      );
    }

    const id = data.id || crypto.randomUUID();
    const isPaused =
      data.isPaused !== undefined
        ? Number(Boolean(data.isPaused))
        : Number(Boolean(data.is_paused || 0));
    const humanRequested =
      data.humanRequested !== undefined
        ? Number(Boolean(data.humanRequested))
        : Number(Boolean(data.human_requested || 0));
    const pausedContextJson = DatabaseManager.stringifyJson(
      data.pausedContext ?? data.paused_context ?? data.paused_context_json ?? [],
      '[]'
    );
    const lastMessageAt =
      data.lastMessageAt ?? data.last_message_at ?? new Date().toISOString();

    this._db()
      .prepare(
        `INSERT INTO conversations (
          id, partner_id, customer_id, channel, external_chat_id,
          is_paused, human_requested, paused_context_json, last_message_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(partner_id, channel, external_chat_id) DO UPDATE SET
          customer_id = excluded.customer_id,
          last_message_at = COALESCE(excluded.last_message_at, conversations.last_message_at)`
      )
      .run(
        id,
        partnerId,
        customerId,
        channel,
        externalChatId,
        isPaused,
        humanRequested,
        pausedContextJson,
        lastMessageAt
      );

    return this.findByExternalChat(partnerId, channel, externalChatId);
  }

  /**
   * Finds a conversation by primary key, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  findById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare('SELECT * FROM conversations WHERE id = ? AND partner_id = ?')
          .get(id, partnerId)
      : this._db().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    return hydrateConversation(row);
  }

  /**
   * Finds a conversation by (partner_id, channel, external_chat_id).
   * @param {string} partnerId
   * @param {string} channel
   * @param {string} externalChatId
   */
  findByExternalChat(partnerId, channel, externalChatId) {
    const row = this._db()
      .prepare(
        `SELECT * FROM conversations
         WHERE partner_id = ? AND channel = ? AND external_chat_id = ?`
      )
      .get(partnerId, String(channel), String(externalChatId));
    return hydrateConversation(row);
  }

  /**
   * Toggles persisted soft-pause and human handoff state.
   * @param {string} id
   * @param {boolean} isPaused
   * @param {{ partnerId?: string, humanRequested?: boolean, pausedContext?: unknown[] }} [options]
   */
  setPaused(id, isPaused, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const assignments = ['is_paused = ?'];
    const params = [Number(Boolean(isPaused))];

    if (options.humanRequested !== undefined) {
      assignments.push('human_requested = ?');
      params.push(Number(Boolean(options.humanRequested)));
    }
    if (options.pausedContext !== undefined) {
      assignments.push('paused_context_json = ?');
      params.push(DatabaseManager.stringifyJson(options.pausedContext, '[]'));
    }

    params.push(id);
    if (partnerId) params.push(partnerId);

    const whereClause = partnerId ? 'id = ? AND partner_id = ?' : 'id = ?';
    this._db()
      .prepare(`UPDATE conversations SET ${assignments.join(', ')} WHERE ${whereClause}`)
      .run(...params);

    return this.findById(id, { partnerId });
  }

  /**
   * Appends a human/customer interaction snippet into `paused_context_json`.
   * @param {string} id
   * @param {unknown} entry
   * @param {string | { partnerId?: string }} [options]
   */
  appendPausedContext(id, entry, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      const conv = hydrateConversation(
        partnerId
          ? db
              .prepare('SELECT * FROM conversations WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
      );
      if (!conv) return null;

      const updated = [...conv.paused_context, entry];
      if (partnerId) {
        db.prepare(
          'UPDATE conversations SET paused_context_json = ? WHERE id = ? AND partner_id = ?'
        ).run(JSON.stringify(updated), id, partnerId);
      } else {
        db.prepare('UPDATE conversations SET paused_context_json = ? WHERE id = ?').run(
          JSON.stringify(updated),
          id
        );
      }
      return hydrateConversation(
        partnerId
          ? db
              .prepare('SELECT * FROM conversations WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM conversations WHERE id = ?').get(id)
      );
    });
  }

  /**
   * Clears `paused_context_json` and resets `human_requested`.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  clearPausedContext(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    return this.setPaused(id, false, {
      partnerId,
      humanRequested: false,
      pausedContext: [],
    });
  }

  /**
   * Lists all conversations for a partner ordered by most recent message.
   * @param {string} partnerId
   * @param {{ limit?: number, offset?: number }} [options]
   */
  listByPartner(partnerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 100;
    const offset = Number.isInteger(options.offset) ? options.offset : 0;
    return this._db()
      .prepare(
        `SELECT * FROM conversations
         WHERE partner_id = ?
         ORDER BY COALESCE(last_message_at, '') DESC, rowid DESC
         LIMIT ? OFFSET ?`
      )
      .all(partnerId, limit, offset)
      .map(hydrateConversation);
  }

  /**
   * Lists currently paused conversations for a partner.
   * @param {string} partnerId
   */
  listPausedByPartner(partnerId) {
    return this._db()
      .prepare(
        'SELECT * FROM conversations WHERE partner_id = ? AND is_paused = 1 ORDER BY last_message_at DESC'
      )
      .all(partnerId)
      .map(hydrateConversation);
  }

  /**
   * Appends a message to `messages` and updates `conversations.last_message_at` atomically.
   * @param {Record<string, unknown>} data
   */
  addMessage(data) {
    const id = data.id || crypto.randomUUID();
    const conversationId = data.conversationId ?? data.conversation_id;
    const partnerId = data.partnerId ?? data.partner_id;
    const direction = String(data.direction || '').toUpperCase();
    const role = String(data.role || '').toLowerCase();
    const contentType = String(data.contentType ?? data.content_type ?? 'text');
    const content = String(data.content ?? '');
    const metadataJson = DatabaseManager.stringifyJson(
      data.metadata ?? data.metadata_json ?? {},
      '{}'
    );

    if (!conversationId || !partnerId || !direction || !role) {
      throw new Error(
        'ConversationRepository.addMessage requires conversationId, partnerId, direction, and role'
      );
    }

    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      db.prepare(
        `INSERT INTO messages (
          id, conversation_id, partner_id, direction, role, content_type, content, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        conversationId,
        partnerId,
        direction,
        role,
        contentType,
        content,
        metadataJson
      );

      db.prepare(
        'UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(conversationId);

      return hydrateMessage(
        db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
      );
    });
  }

  /**
   * Lists messages in a conversation, optionally scoped by `partnerId`.
   * @param {string} conversationId
   * @param {{ limit?: number, offset?: number, order?: 'ASC' | 'DESC', partnerId?: string }} [options]
   */
  listMessages(conversationId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const offset = Number.isInteger(options.offset) ? options.offset : 0;
    const order = String(options.order || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const partnerId = DatabaseManager.extractPartnerId(options);

    const sql = partnerId
      ? `SELECT * FROM messages
         WHERE conversation_id = ? AND partner_id = ?
         ORDER BY created_at ${order}, rowid ${order}
         LIMIT ? OFFSET ?`
      : `SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ${order}, rowid ${order}
         LIMIT ? OFFSET ?`;
    const params = partnerId
      ? [conversationId, partnerId, limit, offset]
      : [conversationId, limit, offset];

    return this._db()
      .prepare(sql)
      .all(...params)
      .map(hydrateMessage);
  }

  /**
   * Returns the latest `limit` messages in chronological (oldest -> newest) order.
   * Optionally scoped by `partnerId`.
   * @param {string} conversationId
   * @param {number | { limit?: number, partnerId?: string }} [limitOrOptions=20]
   * @param {{ partnerId?: string }} [maybeOptions]
   */
  getRecentMessages(conversationId, limitOrOptions = 20, maybeOptions = {}) {
    const limit =
      typeof limitOrOptions === 'number'
        ? limitOrOptions
        : Number.isInteger(limitOrOptions?.limit)
          ? limitOrOptions.limit
          : 20;
    const partnerId =
      typeof limitOrOptions === 'object' && limitOrOptions !== null
        ? DatabaseManager.extractPartnerId(limitOrOptions)
        : DatabaseManager.extractPartnerId(maybeOptions);

    const sql = partnerId
      ? `SELECT m.* FROM messages m
         JOIN (
           SELECT id, created_at, rowid AS _seq
           FROM messages
           WHERE conversation_id = ? AND partner_id = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?
         ) recent ON m.id = recent.id
         ORDER BY recent.created_at ASC, recent._seq ASC`
      : `SELECT m.* FROM messages m
         JOIN (
           SELECT id, created_at, rowid AS _seq
           FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?
         ) recent ON m.id = recent.id
         ORDER BY recent.created_at ASC, recent._seq ASC`;
    const params = partnerId ? [conversationId, partnerId, limit] : [conversationId, limit];

    const rows = this._db().prepare(sql).all(...params);
    return rows.map(hydrateMessage);
  }
}

module.exports = { ConversationRepository };
~~~~

### core/storage/repositories/CustomerRepository.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** `core/storage/DatabaseManager`
- **Exports principais:** `CustomerRepository`
- **Total de linhas:** 217

~~~~javascript
'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

/**
 * Normalizes a customer row with parsed JSON facts.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydrateCustomer(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    visits_count: Number(plain.visits_count || 0),
    facts: DatabaseManager.parseJson(plain.facts_json, {}),
  };
}

/**
 * Repository for end-customers CRM records (`customers`).
 */
class CustomerRepository {
  /**
   * @param {DatabaseManager | import('node:sqlite').DatabaseSync} dbOrManager
   */
  constructor(dbOrManager) {
    this.dbOrManager = dbOrManager;
  }

  /**
   * @private
   */
  _db() {
    return DatabaseManager.resolveDb(this.dbOrManager);
  }

  /**
   * Inserts or updates a customer identified by (partner_id, channel, external_id).
   * @param {Record<string, unknown>} data
   */
  upsert(data) {
    const partnerId = data.partnerId ?? data.partner_id;
    const channel = String(data.channel || '').trim();
    const externalId = String(data.externalId ?? data.external_id ?? '').trim();

    if (!partnerId || !channel || !externalId) {
      throw new Error(
        'CustomerRepository.upsert requires partnerId, channel, and externalId'
      );
    }

    const id = data.id || crypto.randomUUID();
    const name = data.name ?? null;
    const phone = data.phone ?? null;
    const factsJson = DatabaseManager.stringifyJson(
      data.facts ?? data.facts_json ?? {},
      '{}'
    );
    const visitsCount = Number.isInteger(data.visitsCount ?? data.visits_count)
      ? Number(data.visitsCount ?? data.visits_count)
      : 0;
    const lastSeenAt =
      data.lastSeenAt ?? data.last_seen_at ?? new Date().toISOString();

    this._db()
      .prepare(
        `INSERT INTO customers (
          id, partner_id, channel, external_id, name, phone, facts_json, visits_count, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(partner_id, channel, external_id) DO UPDATE SET
          name = COALESCE(excluded.name, customers.name),
          phone = COALESCE(excluded.phone, customers.phone),
          facts_json = CASE
            WHEN excluded.facts_json IS NOT NULL AND excluded.facts_json != '{}' THEN excluded.facts_json
            ELSE customers.facts_json
          END,
          last_seen_at = COALESCE(excluded.last_seen_at, customers.last_seen_at)`
      )
      .run(
        id,
        partnerId,
        channel,
        externalId,
        name,
        phone,
        factsJson,
        visitsCount,
        lastSeenAt
      );

    return this.findByExternal(partnerId, channel, externalId);
  }

  /**
   * Finds a customer by primary key, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  findById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare('SELECT * FROM customers WHERE id = ? AND partner_id = ?')
          .get(id, partnerId)
      : this._db().prepare('SELECT * FROM customers WHERE id = ?').get(id);
    return hydrateCustomer(row);
  }

  /**
   * Finds a customer by partner, channel, and external identifier.
   * @param {string} partnerId
   * @param {string} channel
   * @param {string} externalId
   */
  findByExternal(partnerId, channel, externalId) {
    const row = this._db()
      .prepare(
        'SELECT * FROM customers WHERE partner_id = ? AND channel = ? AND external_id = ?'
      )
      .get(partnerId, String(channel), String(externalId));
    return hydrateCustomer(row);
  }

  /**
   * Lists customers belonging to a partner.
   * @param {string} partnerId
   * @param {{ limit?: number, offset?: number }} [options]
   */
  listByPartner(partnerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 100;
    const offset = Number.isInteger(options.offset) ? options.offset : 0;
    return this._db()
      .prepare(
        `SELECT * FROM customers
         WHERE partner_id = ?
         ORDER BY COALESCE(last_seen_at, '') DESC, id ASC
         LIMIT ? OFFSET ?`
      )
      .all(partnerId, limit, offset)
      .map(hydrateCustomer);
  }

  /**
   * Atomically merges facts into `customers.facts_json`.
   * Optionally scoped by `partnerId`.
   * @param {string} id
   * @param {Record<string, unknown>} factsPatch
   * @param {string | { partnerId?: string }} [options]
   */
  updateFacts(id, factsPatch = {}, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      const existing = hydrateCustomer(
        partnerId
          ? db
              .prepare('SELECT * FROM customers WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
      );
      if (!existing) return null;

      const merged = { ...existing.facts, ...factsPatch };
      if (partnerId) {
        db.prepare(
          'UPDATE customers SET facts_json = ? WHERE id = ? AND partner_id = ?'
        ).run(JSON.stringify(merged), id, partnerId);
      } else {
        db.prepare('UPDATE customers SET facts_json = ? WHERE id = ?').run(
          JSON.stringify(merged),
          id
        );
      }
      return hydrateCustomer(
        partnerId
          ? db
              .prepare('SELECT * FROM customers WHERE id = ? AND partner_id = ?')
              .get(id, partnerId)
          : db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
      );
    });
  }

  /**
   * Increments `visits_count` and updates `last_seen_at`.
   * Optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string} [seenAt]
   * @param {string | { partnerId?: string }} [options]
   */
  incrementVisits(id, seenAt = new Date().toISOString(), options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    if (partnerId) {
      this._db()
        .prepare(
          `UPDATE customers
           SET visits_count = COALESCE(visits_count, 0) + 1,
               last_seen_at = ?
           WHERE id = ? AND partner_id = ?`
        )
        .run(seenAt, id, partnerId);
    } else {
      this._db()
        .prepare(
          `UPDATE customers
           SET visits_count = COALESCE(visits_count, 0) + 1,
               last_seen_at = ?
           WHERE id = ?`
        )
        .run(seenAt, id);
    }
    return this.findById(id, { partnerId });
  }
}

module.exports = { CustomerRepository };
~~~~

### core/storage/repositories/OrderRepository.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** `core/storage/DatabaseManager`
- **Exports principais:** `OrderRepository`
- **Total de linhas:** 316

~~~~javascript
'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

const VALID_ORDER_STATUSES = new Set(['CONFIRMED', 'CANCELLED', 'DELIVERED']);

/**
 * Normalizes an order row with parsed items array.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydrateOrder(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    total_cents: Number(plain.total_cents),
    items: DatabaseManager.parseJson(plain.items_json, []),
  };
}

/**
 * Repository for product orders (`orders`) with immutable item/total snapshots.
 */
class OrderRepository {
  /**
   * @param {DatabaseManager | import('node:sqlite').DatabaseSync} dbOrManager
   */
  constructor(dbOrManager) {
    this.dbOrManager = dbOrManager;
  }

  /**
   * @private
   */
  _db() {
    return DatabaseManager.resolveDb(this.dbOrManager);
  }

  /**
   * Creates a product order atomically.
   * If `items` entries omit snapshot pricing (`priceCents` / `price_cents`),
   * resolves active PRODUCT records from `catalog_items` and computes `total_cents`.
   * @param {Record<string, unknown>} data
   */
  create(data) {
    const id = data.id || crypto.randomUUID();
    const partnerId = data.partnerId ?? data.partner_id;
    const customerId = data.customerId ?? data.customer_id ?? null;
    const clientName = String(data.clientName ?? data.client_name ?? '').trim();
    const customerPhone = data.customerPhone ?? data.customer_phone ?? null;
    const rawItems = data.items;
    const paymentMethod = data.paymentMethod ?? data.payment_method ?? null;
    const deliveryType = data.deliveryType ?? data.delivery_type ?? null;
    const address = data.address ?? null;
    const notes = data.notes ?? null;
    const status = String(data.status || 'CONFIRMED').toUpperCase();
    const idempotencyKey = data.idempotencyKey ?? data.idempotency_key ?? null;

    if (!partnerId || !clientName) {
      throw new Error('OrderRepository.create requires partnerId and clientName');
    }
    if (!VALID_ORDER_STATUSES.has(status)) {
      throw new Error(`Invalid order status: ${status}`);
    }
    if (!Array.isArray(rawItems) && typeof data.items_json !== 'string') {
      throw new Error('OrderRepository.create requires an items array or items_json');
    }

    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      let resolvedItems;
      let totalCents = data.totalCents ?? data.total_cents;

      if (Array.isArray(rawItems)) {
        let computedTotal = 0;
        resolvedItems = rawItems.map((entry) => {
          const qty = Number(entry.qty ?? entry.quantity ?? 1);
          if (!Number.isInteger(qty) || qty <= 0) {
            throw new Error(`Order item qty must be a positive integer, got: ${qty}`);
          }

          const unitPrice = entry.priceCents ?? entry.price_cents;
          const itemName = entry.name ?? entry.itemName ?? entry.item_name;
          const catalogItemId =
            entry.catalogItemId ?? entry.catalog_item_id ?? entry.itemId ?? entry.item_id;

          if (unitPrice !== undefined && itemName !== undefined) {
            const cents = Number(unitPrice);
            if (!Number.isInteger(cents) || cents < 0) {
              throw new Error(`Invalid item price_cents: ${cents}`);
            }
            computedTotal += cents * qty;
            return {
              catalog_item_id: catalogItemId || null,
              name: String(itemName),
              price_cents: cents,
              qty,
              subtotal_cents: cents * qty,
            };
          }

          if (!catalogItemId) {
            throw new Error(
              'Order item without snapshot price/name must specify catalogItemId/itemId'
            );
          }

          const catalogItem = DatabaseManager.toPlain(
            db
              .prepare('SELECT * FROM catalog_items WHERE id = ? AND partner_id = ?')
              .get(catalogItemId, partnerId)
          );
          if (!catalogItem) {
            throw new Error(`Catalog item not found: ${catalogItemId}`);
          }
          if (Number(catalogItem.active) !== 1) {
            throw new Error(`Catalog item is inactive: ${catalogItemId}`);
          }
          if (catalogItem.item_type !== 'PRODUCT') {
            throw new Error(
              `Cannot order non-PRODUCT catalog item: ${catalogItemId} (${catalogItem.item_type})`
            );
          }

          const cents = Number(catalogItem.price_cents);
          computedTotal += cents * qty;
          return {
            catalog_item_id: catalogItem.id,
            name: catalogItem.name,
            price_cents: cents,
            qty,
            subtotal_cents: cents * qty,
            version_hash: catalogItem.version_hash,
          };
        });

        if (totalCents === undefined) {
          totalCents = computedTotal;
        }
      } else {
        resolvedItems = DatabaseManager.parseJson(data.items_json, []);
      }

      const finalTotal = Number(totalCents);
      if (!Number.isInteger(finalTotal) || finalTotal < 0) {
        throw new Error(`total_cents must be a non-negative integer, got: ${finalTotal}`);
      }

      const itemsJson =
        typeof data.items_json === 'string' && !Array.isArray(rawItems)
          ? data.items_json
          : JSON.stringify(resolvedItems);

      db.prepare(
        `INSERT INTO orders (
          id, partner_id, customer_id, client_name, customer_phone,
          items_json, total_cents, payment_method, delivery_type,
          address, notes, status, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        partnerId,
        customerId,
        clientName,
        customerPhone,
        itemsJson,
        finalTotal,
        paymentMethod,
        deliveryType,
        address,
        notes,
        status,
        idempotencyKey
      );

      return hydrateOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
    });
  }

  /**
   * Finds an order by primary key, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  findById(id, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare('SELECT * FROM orders WHERE id = ? AND partner_id = ?')
          .get(id, partnerId)
      : this._db().prepare('SELECT * FROM orders WHERE id = ?').get(id);
    return hydrateOrder(row);
  }

  /**
   * Finds an order by idempotency key, optionally scoped by `partnerId`.
   * @param {string} idempotencyKey
   * @param {string | { partnerId?: string }} [options]
   */
  findByIdempotencyKey(idempotencyKey, options = {}) {
    const partnerId = DatabaseManager.extractPartnerId(options);
    const row = partnerId
      ? this._db()
          .prepare('SELECT * FROM orders WHERE idempotency_key = ? AND partner_id = ?')
          .get(idempotencyKey, partnerId)
      : this._db()
          .prepare('SELECT * FROM orders WHERE idempotency_key = ?')
          .get(idempotencyKey);
    return hydrateOrder(row);
  }

  /**
   * Lists orders for a partner.
   * @param {string} partnerId
   * @param {{ status?: string, limit?: number, offset?: number }} [options]
   */
  listByPartner(partnerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const offset = Number.isInteger(options.offset) ? options.offset : 0;

    if (options.status) {
      return this._db()
        .prepare(
          `SELECT * FROM orders
           WHERE partner_id = ? AND status = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ? OFFSET ?`
        )
        .all(partnerId, String(options.status).toUpperCase(), limit, offset)
        .map(hydrateOrder);
    }

    return this._db()
      .prepare(
        `SELECT * FROM orders
         WHERE partner_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ? OFFSET ?`
      )
      .all(partnerId, limit, offset)
      .map(hydrateOrder);
  }

  /**
   * Lists orders for a customer, optionally scoped by `partnerId`.
   * @param {string} customerId
   * @param {{ limit?: number, partnerId?: string }} [options]
   */
  listByCustomer(customerId, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const partnerId = DatabaseManager.extractPartnerId(options);
    const sql = partnerId
      ? `SELECT * FROM orders
         WHERE customer_id = ? AND partner_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`
      : `SELECT * FROM orders
         WHERE customer_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`;
    const params = partnerId ? [customerId, partnerId, limit] : [customerId, limit];
    return this._db()
      .prepare(sql)
      .all(...params)
      .map(hydrateOrder);
  }

  /**
   * Updates order status, optionally scoped by `partnerId`.
   * @param {string} id
   * @param {'CONFIRMED' | 'CANCELLED' | 'DELIVERED'} status
   * @param {string | { partnerId?: string }} [options]
   */
  updateStatus(id, status, options = {}) {
    const normalized = String(status).toUpperCase();
    if (!VALID_ORDER_STATUSES.has(normalized)) {
      throw new Error(`Invalid order status: ${status}`);
    }
    const partnerId = DatabaseManager.extractPartnerId(options);
    if (partnerId) {
      this._db()
        .prepare(
          'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND partner_id = ?'
        )
        .run(normalized, id, partnerId);
    } else {
      this._db()
        .prepare(
          'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        )
        .run(normalized, id);
    }
    return this.findById(id, { partnerId });
  }

  /**
   * Cancels an order.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  cancel(id, options = {}) {
    return this.updateStatus(id, 'CANCELLED', options);
  }

  /**
   * Marks an order as delivered.
   * @param {string} id
   * @param {string | { partnerId?: string }} [options]
   */
  markDelivered(id, options = {}) {
    return this.updateStatus(id, 'DELIVERED', options);
  }
}

module.exports = { OrderRepository };
~~~~

### core/storage/repositories/PartnerRepository.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** `core/storage/DatabaseManager`
- **Exports principais:** `PartnerRepository`, `DEFAULT_FEATURE_FLAGS`
- **Total de linhas:** 397

~~~~javascript
'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

const DEFAULT_FEATURE_FLAGS = Object.freeze({
  bookings: true,
  orders: true,
  voiceStt: true,
  voiceTts: false,
  googleCalendar: false,
  webhooks: false,
  softPause: true,
  ownerCommands: true,
});

function parseTextOrJson(raw, fallback) {
  if (raw === null || raw === undefined || raw === '') {
    return fallback;
  }
  if (typeof raw !== 'string') {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function serializeStructuredField(value, fallback = null) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return JSON.stringify('');
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

/**
 * Normalizes a partner row into a plain object with parsed JSON fields.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydratePartner(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    is_active: Number(plain.is_active),
    working_hours: parseTextOrJson(plain.working_hours_json, null),
    policies: parseTextOrJson(plain.policies_json, null),
    pdf_files: DatabaseManager.parseJson(plain.pdf_files_json, []),
    image_files: DatabaseManager.parseJson(plain.image_files_json, []),
    feature_flags: DatabaseManager.parseJson(
      plain.feature_flags_json,
      { ...DEFAULT_FEATURE_FLAGS }
    ),
  };
}

/**
 * Repository for partners, partner integrations, and unified audit logs.
 */
class PartnerRepository {
  /**
   * @param {DatabaseManager | import('node:sqlite').DatabaseSync} dbOrManager
   */
  constructor(dbOrManager) {
    this.dbOrManager = dbOrManager;
  }

  /**
   * @private
   */
  _db() {
    return DatabaseManager.resolveDb(this.dbOrManager);
  }

  /**
   * Creates a new partner record.
   * @param {Record<string, unknown>} data
   */
  create(data) {
    if (!data || !data.email || !data.displayName && !data.display_name) {
      throw new Error('PartnerRepository.create requires email and displayName');
    }

    const id = data.id || crypto.randomUUID();
    const email = String(data.email).trim().toLowerCase();
    const passwordHash = data.passwordHash ?? data.password_hash ?? null;
    const displayName = String(data.displayName ?? data.display_name).trim();
    const storeSegment = data.storeSegment ?? data.store_segment ?? null;
    const isActive =
      data.isActive !== undefined
        ? Number(Boolean(data.isActive))
        : data.is_active !== undefined
          ? Number(Boolean(data.is_active))
          : 1;
    const personalityPrompt = data.personalityPrompt ?? data.personality_prompt ?? null;
    const businessRules = data.businessRules ?? data.business_rules ?? null;
    const workingHoursJson = serializeStructuredField(
      data.workingHours ?? data.working_hours ?? data.working_hours_json,
      null
    );
    const policiesJson = serializeStructuredField(
      data.policies ?? data.policies_json,
      null
    );
    const welcomeMessage =
      data.welcomeMessage ??
      data.welcome_message ??
      'Olá! Como posso te ajudar hoje?';
    const pdfFilesJson = DatabaseManager.stringifyJson(
      data.pdfFiles ?? data.pdf_files ?? data.pdf_files_json,
      '[]'
    );
    const imageFilesJson = DatabaseManager.stringifyJson(
      data.imageFiles ?? data.image_files ?? data.image_files_json,
      '[]'
    );
    const ownerJid = data.ownerJid ?? data.owner_jid ?? null;
    const logoDataUrl = data.logoDataUrl ?? data.logo_data_url ?? null;
    const featureFlagsJson = DatabaseManager.stringifyJson(
      data.featureFlags ?? data.feature_flags ?? data.feature_flags_json ?? DEFAULT_FEATURE_FLAGS,
      JSON.stringify(DEFAULT_FEATURE_FLAGS)
    );

    this._db()
      .prepare(
        `INSERT INTO partners (
          id, email, password_hash, display_name, store_segment, is_active,
          personality_prompt, business_rules, working_hours_json, policies_json,
          welcome_message, pdf_files_json, image_files_json, owner_jid, logo_data_url, feature_flags_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        email,
        passwordHash,
        displayName,
        storeSegment,
        isActive,
        personalityPrompt,
        businessRules,
        workingHoursJson,
        policiesJson,
        welcomeMessage,
        pdfFilesJson,
        imageFilesJson,
        ownerJid,
        logoDataUrl,
        featureFlagsJson
      );

    return this.findById(id);
  }

  /**
   * Finds a partner by primary key.
   * @param {string} id
   */
  findById(id) {
    const row = this._db()
      .prepare('SELECT * FROM partners WHERE id = ?')
      .get(id);
    return hydratePartner(row);
  }

  /**
   * Finds a partner by email.
   * @param {string} email
   */
  findByEmail(email) {
    const row = this._db()
      .prepare('SELECT * FROM partners WHERE email = ?')
      .get(String(email).trim().toLowerCase());
    return hydratePartner(row);
  }

  /**
   * Lists partners, optionally filtered to active ones.
   * @param {{ activeOnly?: boolean }} [options]
   */
  list(options = {}) {
    const sql = options.activeOnly
      ? 'SELECT * FROM partners WHERE is_active = 1 ORDER BY created_at ASC, id ASC'
      : 'SELECT * FROM partners ORDER BY created_at ASC, id ASC';
    return this._db()
      .prepare(sql)
      .all()
      .map(hydratePartner);
  }

  /**
   * Updates mutable fields of a partner.
   * @param {string} id
   * @param {Record<string, unknown>} patch
   */
  update(id, patch = {}) {
    const fieldMap = {
      email: (v) => ['email', String(v).trim().toLowerCase()],
      passwordHash: (v) => ['password_hash', v],
      password_hash: (v) => ['password_hash', v],
      displayName: (v) => ['display_name', String(v).trim()],
      display_name: (v) => ['display_name', String(v).trim()],
      storeSegment: (v) => ['store_segment', v],
      store_segment: (v) => ['store_segment', v],
      isActive: (v) => ['is_active', Number(Boolean(v))],
      is_active: (v) => ['is_active', Number(Boolean(v))],
      personalityPrompt: (v) => ['personality_prompt', v],
      personality_prompt: (v) => ['personality_prompt', v],
      businessRules: (v) => ['business_rules', v],
      business_rules: (v) => ['business_rules', v],
      workingHours: (v) => ['working_hours_json', serializeStructuredField(v, null)],
      working_hours_json: (v) => ['working_hours_json', serializeStructuredField(v, null)],
      policies: (v) => ['policies_json', serializeStructuredField(v, null)],
      policies_json: (v) => ['policies_json', serializeStructuredField(v, null)],
      welcomeMessage: (v) => ['welcome_message', v],
      welcome_message: (v) => ['welcome_message', v],
      pdfFiles: (v) => ['pdf_files_json', DatabaseManager.stringifyJson(v, '[]')],
      pdf_files_json: (v) => ['pdf_files_json', DatabaseManager.stringifyJson(v, '[]')],
      imageFiles: (v) => ['image_files_json', DatabaseManager.stringifyJson(v, '[]')],
      image_files_json: (v) => ['image_files_json', DatabaseManager.stringifyJson(v, '[]')],
      ownerJid: (v) => ['owner_jid', v],
      owner_jid: (v) => ['owner_jid', v],
      logoDataUrl: (v) => ['logo_data_url', v],
      logo_data_url: (v) => ['logo_data_url', v],
      featureFlags: (v) => ['feature_flags_json', DatabaseManager.stringifyJson(v, '{}')],
      feature_flags_json: (v) => ['feature_flags_json', DatabaseManager.stringifyJson(v, '{}')],
    };

    const assignments = [];
    const values = [];

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || !fieldMap[key]) continue;
      const [column, normalized] = fieldMap[key](value);
      assignments.push(`${column} = ?`);
      values.push(normalized);
    }

    if (assignments.length === 0) {
      return this.findById(id);
    }

    assignments.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    this._db()
      .prepare(`UPDATE partners SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...values);

    return this.findById(id);
  }

  /**
   * Soft-disables a partner account.
   * @param {string} id
   */
  deactivate(id) {
    return this.update(id, { isActive: false });
  }

  /**
   * Hard-deletes a partner (cascades via foreign keys).
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const info = this._db().prepare('DELETE FROM partners WHERE id = ?').run(id);
    return info.changes > 0;
  }

  /**
   * Upserts external integration credentials for a partner.
   * @param {{ id?: string, partnerId: string, provider: string, credentials: unknown, expiresAt?: number | null }} data
   */
  upsertIntegration(data) {
    const id = data.id || crypto.randomUUID();
    const partnerId = data.partnerId ?? data.partner_id;
    const provider = String(data.provider).trim();
    const credentialsJson = DatabaseManager.stringifyJson(
      data.credentials ?? data.credentials_json,
      '{}'
    );
    const expiresAt = data.expiresAt ?? data.expires_at ?? null;

    this._db()
      .prepare(
        `INSERT INTO partner_integrations (id, partner_id, provider, credentials_json, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(partner_id, provider) DO UPDATE SET
           credentials_json = excluded.credentials_json,
           expires_at = excluded.expires_at,
           updated_at = CURRENT_TIMESTAMP`
      )
      .run(id, partnerId, provider, credentialsJson, expiresAt);

    return this.getIntegration(partnerId, provider);
  }

  /**
   * Retrieves a partner integration record.
   * @param {string} partnerId
   * @param {string} provider
   */
  getIntegration(partnerId, provider) {
    const row = this._db()
      .prepare('SELECT * FROM partner_integrations WHERE partner_id = ? AND provider = ?')
      .get(partnerId, provider);
    const plain = DatabaseManager.toPlain(row);
    if (!plain) return null;
    return {
      ...plain,
      credentials: DatabaseManager.parseJson(plain.credentials_json, {}),
    };
  }

  /**
   * Removes an integration configuration for a partner.
   * @param {string} partnerId
   * @param {string} provider
   * @returns {boolean}
   */
  deleteIntegration(partnerId, provider) {
    const info = this._db()
      .prepare('DELETE FROM partner_integrations WHERE partner_id = ? AND provider = ?')
      .run(partnerId, provider);
    return info.changes > 0;
  }

  /**
   * Appends a structured audit log entry.
   * @param {{ partnerId?: string | null, eventType: string, severity: string, message: string, metadata?: unknown }} entry
   */
  recordAudit(entry) {
    const partnerId = entry.partnerId ?? entry.partner_id ?? null;
    const eventType = String(entry.eventType ?? entry.event_type);
    const severity = String(entry.severity || 'INFO');
    const message = String(entry.message);
    const metadataJson = DatabaseManager.stringifyJson(
      entry.metadata ?? entry.metadata_json,
      null
    );

    const info = this._db()
      .prepare(
        `INSERT INTO audit_logs (partner_id, event_type, severity, message, metadata_json)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(partnerId, eventType, severity, message, metadataJson);

    const row = this._db()
      .prepare('SELECT * FROM audit_logs WHERE id = ?')
      .get(Number(info.lastInsertRowid));
    const plain = DatabaseManager.toPlain(row);
    return plain
      ? { ...plain, metadata: DatabaseManager.parseJson(plain.metadata_json, null) }
      : null;
  }

  /**
   * Lists recent audit logs, optionally scoped to a partner.
   * @param {string | null} [partnerId]
   * @param {{ limit?: number }} [options]
   */
  listAuditLogs(partnerId = null, options = {}) {
    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const rows = partnerId
      ? this._db()
          .prepare(
            'SELECT * FROM audit_logs WHERE partner_id = ? ORDER BY id DESC LIMIT ?'
          )
          .all(partnerId, limit)
      : this._db()
          .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?')
          .all(limit);

    return rows.map((row) => {
      const plain = DatabaseManager.toPlain(row);
      return {
        ...plain,
        metadata: DatabaseManager.parseJson(plain.metadata_json, null),
      };
    });
  }
}

module.exports = { PartnerRepository, DEFAULT_FEATURE_FLAGS };
~~~~

### core/storage/repositories/QueueRepository.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** `core/storage/DatabaseManager`
- **Exports principais:** `QueueRepository`
- **Total de linhas:** 252

~~~~javascript
'use strict';

const crypto = require('node:crypto');
const { DatabaseManager } = require('../DatabaseManager');

/**
 * Normalizes an outbox queue row with parsed payload object.
 * @param {Record<string, unknown> | null | undefined} row
 */
function hydrateOutbox(row) {
  const plain = DatabaseManager.toPlain(row);
  if (!plain) return null;
  return {
    ...plain,
    attempts: Number(plain.attempts || 0),
    next_attempt_at: Number(plain.next_attempt_at),
    payload: DatabaseManager.parseJson(plain.payload_json, {}),
  };
}

/**
 * Repository for inbound event idempotency (`processed_events`)
 * and durable anti-ban outbound delivery queue (`outbox_queue`).
 */
class QueueRepository {
  /**
   * @param {DatabaseManager | import('node:sqlite').DatabaseSync} dbOrManager
   */
  constructor(dbOrManager) {
    this.dbOrManager = dbOrManager;
  }

  /**
   * @private
   */
  _db() {
    return DatabaseManager.resolveDb(this.dbOrManager);
  }

  /**
   * Checks whether an inbound event key was already processed.
   * @param {string} eventKey
   * @returns {boolean}
   */
  isEventProcessed(eventKey) {
    const row = this._db()
      .prepare('SELECT 1 AS found FROM processed_events WHERE event_key = ?')
      .get(String(eventKey));
    return Boolean(row);
  }

  /**
   * Records an event key idempotently. Returns true if newly inserted.
   * @param {string} eventKey
   * @param {string} sessionKey
   * @returns {boolean}
   */
  markEventProcessed(eventKey, sessionKey) {
    const info = this._db()
      .prepare(
        `INSERT OR IGNORE INTO processed_events (event_key, session_key)
         VALUES (?, ?)`
      )
      .run(String(eventKey), String(sessionKey));
    return info.changes > 0;
  }

  /**
   * Enqueues an outbound payload in `outbox_queue`.
   * @param {Record<string, unknown>} data
   */
  enqueueOutbox(data) {
    const id = data.id || crypto.randomUUID();
    const sessionKey = String(data.sessionKey ?? data.session_key ?? '');
    const channel = String(data.channel || '');
    const recipientId = String(data.recipientId ?? data.recipient_id ?? '');
    const payloadJson = DatabaseManager.stringifyJson(
      data.payload ?? data.payload_json ?? {},
      '{}'
    );
    const status = String(data.status || 'PENDING').toUpperCase();
    const attempts = Number.isInteger(data.attempts) ? data.attempts : 0;
    const nextAttemptAt = Math.trunc(
      Number(data.nextAttemptAt ?? data.next_attempt_at ?? Date.now())
    );

    if (!sessionKey || !channel || !recipientId) {
      throw new Error(
        'QueueRepository.enqueueOutbox requires sessionKey, channel, and recipientId'
      );
    }

    this._db()
      .prepare(
        `INSERT INTO outbox_queue (
          id, session_key, channel, recipient_id, payload_json, status, attempts, next_attempt_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        sessionKey,
        channel,
        recipientId,
        payloadJson,
        status,
        attempts,
        nextAttemptAt
      );

    return this.findOutboxById(id);
  }

  /**
   * Atomically marks an inbound event as processed and enqueues the outbound reply
   * in the same SQLite transaction.
   * @param {{ eventKey: string, sessionKey: string, outboxId?: string, channel: string, recipientId: string, payload: unknown, nextAttemptAt?: number }} data
   */
  enqueueWithIdempotency(data) {
    const eventKey = String(data.eventKey ?? data.event_key);
    const sessionKey = String(data.sessionKey ?? data.session_key);
    const outboxId = data.outboxId ?? data.id ?? crypto.randomUUID();
    const channel = String(data.channel);
    const recipientId = String(data.recipientId ?? data.recipient_id);
    const payloadJson = DatabaseManager.stringifyJson(
      data.payload ?? data.payload_json ?? {},
      '{}'
    );
    const nextAttemptAt = Math.trunc(
      Number(data.nextAttemptAt ?? data.next_attempt_at ?? Date.now())
    );

    return DatabaseManager.runInTransaction(this.dbOrManager, (db) => {
      const insertEvent = db
        .prepare(
          'INSERT OR IGNORE INTO processed_events (event_key, session_key) VALUES (?, ?)'
        )
        .run(eventKey, sessionKey);

      if (insertEvent.changes === 0) {
        return { duplicate: true, enqueued: false, outbox: null };
      }

      db.prepare(
        `INSERT INTO outbox_queue (
          id, session_key, channel, recipient_id, payload_json, status, attempts, next_attempt_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?)`
      ).run(outboxId, sessionKey, channel, recipientId, payloadJson, nextAttemptAt);

      const outbox = hydrateOutbox(
        db.prepare('SELECT * FROM outbox_queue WHERE id = ?').get(outboxId)
      );
      return { duplicate: false, enqueued: true, outbox };
    });
  }

  /**
   * Finds an outbox item by primary key.
   * @param {string} id
   */
  findOutboxById(id) {
    return hydrateOutbox(
      this._db().prepare('SELECT * FROM outbox_queue WHERE id = ?').get(id)
    );
  }

  /**
   * Fetches due PENDING items from the outbox queue.
   * @param {{ nowMs?: number, limit?: number, sessionKey?: string }} [options]
   */
  fetchDueOutbox(options = {}) {
    const nowMs = Math.trunc(Number(options.nowMs ?? Date.now()));
    const limit = Number.isInteger(options.limit) ? options.limit : 20;

    if (options.sessionKey) {
      return this._db()
        .prepare(
          `SELECT * FROM outbox_queue
           WHERE status = 'PENDING' AND next_attempt_at <= ? AND session_key = ?
           ORDER BY next_attempt_at ASC, created_at ASC, rowid ASC
           LIMIT ?`
        )
        .all(nowMs, String(options.sessionKey), limit)
        .map(hydrateOutbox);
    }

    return this._db()
      .prepare(
        `SELECT * FROM outbox_queue
         WHERE status = 'PENDING' AND next_attempt_at <= ?
         ORDER BY next_attempt_at ASC, created_at ASC, rowid ASC
         LIMIT ?`
      )
      .all(nowMs, limit)
      .map(hydrateOutbox);
  }

  /**
   * Counts pending items in `outbox_queue`.
   * @returns {number}
   */
  countPendingOutbox() {
    const row = this._db()
      .prepare("SELECT COUNT(*) AS cnt FROM outbox_queue WHERE status = 'PENDING'")
      .get();
    return Number(row?.cnt || 0);
  }

  /**
   * Marks an outbox entry as SENT.
   * @param {string} id
   */
  markOutboxSent(id) {
    this._db()
      .prepare("UPDATE outbox_queue SET status = 'SENT' WHERE id = ?")
      .run(id);
    return this.findOutboxById(id);
  }

  /**
   * Increments retry attempts and schedules next attempt timestamp.
   * @param {string} id
   * @param {{ nextAttemptAt: number }} options
   */
  markOutboxRetry(id, options) {
    const nextAttemptAt = Math.trunc(Number(options.nextAttemptAt));
    this._db()
      .prepare(
        `UPDATE outbox_queue
         SET attempts = COALESCE(attempts, 0) + 1,
             next_attempt_at = ?
         WHERE id = ?`
      )
      .run(nextAttemptAt, id);
    return this.findOutboxById(id);
  }

  /**
   * Marks an outbox entry as permanently FAILED.
   * @param {string} id
   */
  markOutboxFailed(id) {
    this._db()
      .prepare(
        "UPDATE outbox_queue SET status = 'FAILED', attempts = COALESCE(attempts, 0) + 1 WHERE id = ?"
      )
      .run(id);
    return this.findOutboxById(id);
  }
}

module.exports = { QueueRepository };
~~~~

### core/lifecycle/LifecycleManager.js

- **Bloco:** Bloco 1 — Camada 1 (Storage SQLite, Migrations 001–003 & Lifecycle)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `LifecycleManager`, `DEFAULT_DRAIN_TIMEOUT_MS`
- **Total de linhas:** 244

~~~~javascript
'use strict';

const DEFAULT_DRAIN_TIMEOUT_MS = 10_000;
const DEFAULT_SIGNALS = ['SIGINT', 'SIGTERM'];

/**
 * Runs a cleanup function bounded by a timeout without leaking timer handles.
 * @param {() => (void | Promise<void>)} fn
 * @param {number} timeoutMs
 * @param {string} name
 */
async function runWithTimeout(fn, timeoutMs, name) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    await Promise.resolve(fn());
    return;
  }

  let timer = null;
  try {
    await Promise.race([
      Promise.resolve().then(() => fn()),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Shutdown timeout (${timeoutMs}ms) for resource "${name}"`));
        }, timeoutMs);
        if (typeof timer.unref === 'function') {
          timer.unref();
        }
      }),
    ]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

/**
 * Single centralized coordinator for SIGINT/SIGTERM signals and ordered LIFO
 * shutdown of runtime resources without forcing `process.exit()`.
 */
class LifecycleManager {
  /**
   * @param {{ drainTimeoutMs?: number, signals?: string[], processRef?: NodeJS.EventEmitter, logger?: Console }} [options]
   */
  constructor(options = {}) {
    this.drainTimeoutMs = Number.isFinite(options.drainTimeoutMs)
      ? Number(options.drainTimeoutMs)
      : DEFAULT_DRAIN_TIMEOUT_MS;
    this.signals = Array.isArray(options.signals)
      ? [...options.signals]
      : [...DEFAULT_SIGNALS];
    this.processRef = options.processRef || process;
    this.logger = options.logger || console;

    /** @type {Array<{ id: symbol, name: string, close: (reason: string) => (void | Promise<void>), timeoutMs?: number }>} */
    this._resources = [];
    /** @type {Map<string, () => void>} */
    this._signalHandlers = new Map();
    /** @type {Promise<{ ok: boolean, reason: string, closed: string[], errors: Array<{ name: string, error: Error }> }> | null} */
    this._shutdownPromise = null;
    this._closed = false;
  }

  /**
   * Registers a resource or cleanup handler. Resources are closed in reverse
   * registration order (LIFO) during shutdown.
   * @param {string | (() => void | Promise<void>) | { close: Function }} nameOrTarget
   * @param {(() => void | Promise<void>) | { close: Function, timeoutMs?: number }} [targetOrOptions]
   * @param {{ timeoutMs?: number }} [options]
   * @returns {() => void} Unregister function
   */
  register(nameOrTarget, targetOrOptions, options = {}) {
    let name;
    let closeFn;
    let timeoutMs = options.timeoutMs;

    if (typeof nameOrTarget === 'string') {
      name = nameOrTarget;
      if (typeof targetOrOptions === 'function') {
        closeFn = targetOrOptions;
      } else if (targetOrOptions && typeof targetOrOptions.close === 'function') {
        closeFn = () => targetOrOptions.close();
        if (timeoutMs === undefined && Number.isFinite(targetOrOptions.timeoutMs)) {
          timeoutMs = targetOrOptions.timeoutMs;
        }
      } else {
        throw new TypeError(
          `LifecycleManager.register("${name}") requires a function or an object with close()`
        );
      }
    } else if (typeof nameOrTarget === 'function') {
      name = nameOrTarget.name || `resource_${this._resources.length + 1}`;
      closeFn = nameOrTarget;
      if (targetOrOptions && typeof targetOrOptions === 'object') {
        timeoutMs = targetOrOptions.timeoutMs;
      }
    } else if (nameOrTarget && typeof nameOrTarget.close === 'function') {
      name = nameOrTarget.constructor?.name || `resource_${this._resources.length + 1}`;
      closeFn = () => nameOrTarget.close();
      if (targetOrOptions && typeof targetOrOptions === 'object') {
        timeoutMs = targetOrOptions.timeoutMs;
      }
    } else {
      throw new TypeError(
        'LifecycleManager.register requires (name, fn|closeable) or (fn|closeable)'
      );
    }

    const entry = {
      id: Symbol(name),
      name,
      close: closeFn,
      timeoutMs,
    };

    this._resources.push(entry);

    return () => {
      const idx = this._resources.findIndex((item) => item.id === entry.id);
      if (idx !== -1) {
        this._resources.splice(idx, 1);
      }
    };
  }

  /**
   * Returns registered resource names in registration order.
   * @returns {string[]}
   */
  getRegisteredNames() {
    return this._resources.map((entry) => entry.name);
  }

  /**
   * Installs SIGINT/SIGTERM handlers on `processRef` (idempotent).
   * Never calls `process.exit()` forcibly; allows the event loop to drain naturally.
   * @returns {LifecycleManager}
   */
  installSignals() {
    if (this._signalHandlers.size > 0) {
      return this;
    }

    for (const signal of this.signals) {
      const listener = () => {
        this.shutdown(signal).then((result) => {
          if (!result.ok && this.processRef && typeof this.processRef === 'object') {
            this.processRef.exitCode = 1;
          }
        });
      };
      this._signalHandlers.set(signal, listener);
      this.processRef.on(signal, listener);
    }

    return this;
  }

  /**
   * Detaches installed SIGINT/SIGTERM listeners cleanly.
   */
  uninstallSignals() {
    for (const [signal, listener] of this._signalHandlers.entries()) {
      if (typeof this.processRef.off === 'function') {
        this.processRef.off(signal, listener);
      } else if (typeof this.processRef.removeListener === 'function') {
        this.processRef.removeListener(signal, listener);
      }
    }
    this._signalHandlers.clear();
  }

  /**
   * Indicates whether shutdown has been initiated.
   * @returns {boolean}
   */
  isShuttingDown() {
    return this._shutdownPromise !== null;
  }

  /**
   * Indicates whether shutdown has completed.
   * @returns {boolean}
   */
  isClosed() {
    return this._closed;
  }

  /**
   * Executes ordered LIFO shutdown of all registered resources without forcing process.exit.
   * Repeated calls return the same in-flight/completed promise.
   * @param {string} [reason='manual']
   * @returns {Promise<{ ok: boolean, reason: string, closed: string[], errors: Array<{ name: string, error: Error }> }>}
   */
  shutdown(reason = 'manual') {
    if (this._shutdownPromise) {
      return this._shutdownPromise;
    }

    this._shutdownPromise = (async () => {
      this.uninstallSignals();

      const snapshot = [...this._resources];
      const closed = [];
      const errors = [];

      for (let i = snapshot.length - 1; i >= 0; i -= 1) {
        const entry = snapshot[i];
        const timeoutMs =
          entry.timeoutMs !== undefined ? entry.timeoutMs : this.drainTimeoutMs;

        try {
          await runWithTimeout(() => entry.close(reason), timeoutMs, entry.name);
          closed.push(entry.name);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          errors.push({ name: entry.name, error });
          if (this.logger && typeof this.logger.error === 'function') {
            this.logger.error(
              `[LifecycleManager] Error closing "${entry.name}" (${reason}):`,
              error.message
            );
          }
        }
      }

      this._resources.length = 0;
      this._closed = true;

      return {
        ok: errors.length === 0,
        reason,
        closed,
        errors,
      };
    })();

    return this._shutdownPromise;
  }
}

module.exports = { LifecycleManager, DEFAULT_DRAIN_TIMEOUT_MS };
~~~~

## Bloco 2 — Camada 2 (Domínio PME, Calendário Dinâmico & Elos 1 e 2)

### core/domain/BookingService.js

- **Bloco:** Bloco 2 — Camada 2 (Domínio PME, Calendário Dinâmico & Elos 1 e 2)
- **Imports internos (`require` / `import`):** `core/domain/RegionalNormalizer`, `core/storage/DatabaseManager`, `core/storage/repositories/AppointmentRepository`, `core/storage/repositories/CatalogRepository`, `core/storage/repositories/PartnerRepository`
- **Exports principais:** `BookingService`, `resolveWorkingWindow`
- **Total de linhas:** 550

~~~~javascript
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
~~~~

### core/domain/CatalogService.js

- **Bloco:** Bloco 2 — Camada 2 (Domínio PME, Calendário Dinâmico & Elos 1 e 2)
- **Imports internos (`require` / `import`):** `core/domain/RegionalNormalizer`, `core/storage/repositories/CatalogRepository`
- **Exports principais:** `CatalogService`, `toDomainItem`
- **Total de linhas:** 229

~~~~javascript
'use strict';

const { CatalogRepository } = require('../storage/repositories/CatalogRepository');
const { DomainError, formatPriceCents } = require('./RegionalNormalizer');

const VALID_TYPES = new Set(['SERVICE', 'PRODUCT']);

/**
 * Formats a persisted catalog row into a canonical domain item representation.
 * @param {Record<string, unknown> | null} row
 */
function toDomainItem(row) {
  if (!row) return null;
  return {
    ...row,
    price_cents: Number(row.price_cents),
    duration_minutes: Number(row.duration_minutes),
    active: Number(row.active),
    track_stock: Number(row.track_stock ?? 0),
    stock_quantity:
      row.stock_quantity !== null && row.stock_quantity !== undefined
        ? Number(row.stock_quantity)
        : null,
    price_label: formatPriceCents(row.price_cents),
  };
}

/**
 * Domain service for catalog items (`SERVICE` and `PRODUCT`) enforcing canonical
 * SHA-256 `version_hash`, non-negative integer pricing in cents, and soft-delete.
 */
class CatalogService {
  /**
   * @param {{ dbManager?: import('../storage/DatabaseManager').DatabaseManager, catalogRepository?: CatalogRepository }} deps
   */
  constructor(deps = {}) {
    if (!deps.catalogRepository && !deps.dbManager) {
      throw new Error('CatalogService requires catalogRepository or dbManager');
    }
    this.dbManager = deps.dbManager || null;
    this.catalogRepository =
      deps.catalogRepository || new CatalogRepository(deps.dbManager);
  }

  /**
   * Creates a catalog item and computes its canonical SHA-256 `version_hash`.
   * @param {string} partnerId
   * @param {Record<string, unknown>} data
   */
  createItem(partnerId, data = {}) {
    if (!partnerId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId é obrigatório.');
    }

    const itemType = String(
      (data.itemType ?? data.item_type ?? data.type) || ''
    ).toUpperCase();
    const name = String(data.name || '').trim();
    const description = String(data.description ?? '');
    const priceCents = Number(data.priceCents ?? data.price_cents);
    const durationMinutes =
      data.durationMinutes !== undefined
        ? Number(data.durationMinutes)
        : data.duration_minutes !== undefined
          ? Number(data.duration_minutes)
          : 30;

    if (!name) {
      throw new DomainError('VALIDATION_ERROR', 'Nome do item é obrigatório.');
    }
    if (!VALID_TYPES.has(itemType)) {
      throw new DomainError(
        'INVALID_ITEM_TYPE',
        `Tipo de item inválido: "${itemType}". Esperado SERVICE ou PRODUCT.`,
        { itemType }
      );
    }
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'priceCents deve ser um inteiro maior ou igual a zero.',
        { priceCents }
      );
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'durationMinutes deve ser um inteiro positivo.',
        { durationMinutes }
      );
    }

    const created = this.catalogRepository.create({
      id: data.id,
      partnerId,
      itemType,
      name,
      description,
      priceCents,
      durationMinutes,
      category: data.category ?? 'geral',
      active: data.active !== undefined ? data.active : true,
      trackStock: data.trackStock ?? data.track_stock ?? false,
      stockQuantity: data.stockQuantity ?? data.stock_quantity ?? null,
    });

    return toDomainItem(created);
  }

  /**
   * Retrieves the authoritative specification of a catalog item scoped by partnerId.
   * @param {string} partnerId
   * @param {string} itemId
   * @param {{ includeInactive?: boolean }} [options]
   */
  getItemSpec(partnerId, itemId, options = {}) {
    const item = this.catalogRepository.findById(itemId, { partnerId });
    if (!item) {
      throw new DomainError(
        'CATALOG_NOT_FOUND',
        `Item de catálogo "${itemId}" não encontrado para este parceiro.`,
        { partnerId, itemId },
        404
      );
    }
    if (!options.includeInactive && Number(item.active) !== 1) {
      throw new DomainError(
        'CATALOG_INACTIVE',
        `Item de catálogo "${item.name}" está desativado.`,
        { partnerId, itemId },
        409
      );
    }
    return toDomainItem(item);
  }

  /**
   * Lists catalog items for a partner.
   * @param {string} partnerId
   * @param {{ type?: string, itemType?: string, category?: string, includeInactive?: boolean }} [options]
   */
  listItems(partnerId, options = {}) {
    const itemType = options.itemType || options.type;
    return this.catalogRepository
      .listByPartner(partnerId, {
        includeInactive: Boolean(options.includeInactive),
        itemType,
        category: options.category,
      })
      .map(toDomainItem);
  }

  /**
   * Updates a catalog item scoped to `partnerId` and recalculates `version_hash`.
   * @param {string} partnerId
   * @param {string} itemId
   * @param {Record<string, unknown>} patch
   */
  updateItem(partnerId, itemId, patch = {}) {
    const existing = this.catalogRepository.findById(itemId, { partnerId });
    if (!existing) {
      throw new DomainError(
        'CATALOG_NOT_FOUND',
        `Item de catálogo "${itemId}" não encontrado para este parceiro.`,
        { partnerId, itemId },
        404
      );
    }

    const normalizedPatch = { ...patch };
    if (patch.type !== undefined && patch.itemType === undefined && patch.item_type === undefined) {
      normalizedPatch.itemType = patch.type;
    }

    if (
      normalizedPatch.itemType !== undefined &&
      !VALID_TYPES.has(String(normalizedPatch.itemType).toUpperCase())
    ) {
      throw new DomainError(
        'INVALID_ITEM_TYPE',
        `Tipo de item inválido: "${normalizedPatch.itemType}".`,
        { itemType: normalizedPatch.itemType }
      );
    }

    const updated = this.catalogRepository.update(itemId, normalizedPatch, { partnerId });
    return toDomainItem(updated);
  }

  /**
   * Soft-deletes (deactivates) a catalog item without altering historical records.
   * @param {string} partnerId
   * @param {string} itemId
   */
  deactivateItem(partnerId, itemId) {
    return this.updateItem(partnerId, itemId, { active: false });
  }

  /**
   * Alias for deactivateItem.
   * @param {string} partnerId
   * @param {string} itemId
   */
  softDeleteItem(partnerId, itemId) {
    return this.deactivateItem(partnerId, itemId);
  }

  /**
   * Reactivates a soft-deleted catalog item.
   * @param {string} partnerId
   * @param {string} itemId
   */
  activateItem(partnerId, itemId) {
    return this.updateItem(partnerId, itemId, { active: true });
  }

  /**
   * Formats a catalog item line for ContextBuilder prompt injection (Doc 01 Elo 1):
   * `[id] Nome — R$ XX,XX (Tipo)`
   * @param {Record<string, unknown>} item
   * @returns {string}
   */
  static formatContextLine(item) {
    return `[${item.id}] ${item.name} — ${formatPriceCents(item.price_cents)} (${item.item_type})`;
  }
}

module.exports = { CatalogService, toDomainItem };
~~~~

### core/domain/CustomerService.js

- **Bloco:** Bloco 2 — Camada 2 (Domínio PME, Calendário Dinâmico & Elos 1 e 2)
- **Imports internos (`require` / `import`):** `core/domain/RegionalNormalizer`, `core/storage/repositories/CustomerRepository`
- **Exports principais:** `CustomerService`
- **Total de linhas:** 124

~~~~javascript
'use strict';

const { CustomerRepository } = require('../storage/repositories/CustomerRepository');
const { DomainError, formatBrazilianPhone } = require('./RegionalNormalizer');

/**
 * Domain service for end-customer CRM profiles, visit counters, and persistent facts.
 */
class CustomerService {
  /**
   * @param {{ dbManager?: import('../storage/DatabaseManager').DatabaseManager, customerRepository?: CustomerRepository }} deps
   */
  constructor(deps = {}) {
    if (!deps.customerRepository && !deps.dbManager) {
      throw new Error('CustomerService requires customerRepository or dbManager');
    }
    this.dbManager = deps.dbManager || null;
    this.customerRepository =
      deps.customerRepository || new CustomerRepository(deps.dbManager);
  }

  /**
   * Creates or updates a customer scoped to `partnerId`.
   * @param {string} partnerId
   * @param {Record<string, unknown>} data
   */
  upsertCustomer(partnerId, data = {}) {
    if (!partnerId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId é obrigatório.');
    }
    const channel = String(data.channel || 'whatsapp').trim();
    const externalId = String(data.externalId ?? data.external_id ?? '').trim();
    if (!externalId) {
      throw new DomainError('VALIDATION_ERROR', 'externalId é obrigatório.');
    }

    const formattedPhone = data.phone
      ? formatBrazilianPhone(String(data.phone))
      : externalId.includes('@')
        ? formatBrazilianPhone(externalId)
        : null;

    return this.customerRepository.upsert({
      id: data.id,
      partnerId,
      channel,
      externalId,
      name: data.name ? String(data.name).trim() : null,
      phone: formattedPhone,
      facts: data.facts ?? {},
      visitsCount: data.visitsCount ?? data.visits_count ?? 0,
      lastSeenAt: data.lastSeenAt ?? data.last_seen_at,
    });
  }

  /**
   * Fetches a customer strictly belonging to `partnerId`.
   * @param {string} partnerId
   * @param {string} customerId
   */
  getCustomer(partnerId, customerId) {
    const customer = this.customerRepository.findById(customerId, { partnerId });
    if (!customer) {
      throw new DomainError(
        'CUSTOMER_NOT_FOUND',
        `Cliente "${customerId}" não encontrado para este parceiro.`,
        { partnerId, customerId },
        404
      );
    }
    return customer;
  }

  /**
   * Finds a customer by channel + externalId.
   * @param {string} partnerId
   * @param {string} channel
   * @param {string} externalId
   */
  findByExternal(partnerId, channel, externalId) {
    return this.customerRepository.findByExternal(partnerId, channel, externalId);
  }

  /**
   * Lists customers for a partner.
   * @param {string} partnerId
   * @param {{ limit?: number, offset?: number }} [options]
   */
  listCustomers(partnerId, options = {}) {
    return this.customerRepository.listByPartner(partnerId, options);
  }

  /**
   * Merges CRM facts and/or increments visit counter inside a transaction.
   * @param {string} partnerId
   * @param {string} customerId
   * @param {{ factsPatch?: Record<string, unknown>, incrementVisit?: boolean, seenAt?: string }} [options]
   */
  recordInteraction(partnerId, customerId, options = {}) {
    const run = () => {
      let customer = this.getCustomer(partnerId, customerId);
      if (options.factsPatch && Object.keys(options.factsPatch).length > 0) {
        customer = this.customerRepository.updateFacts(
          customerId,
          options.factsPatch,
          { partnerId }
        );
      }
      if (options.incrementVisit) {
        customer = this.customerRepository.incrementVisits(
          customerId,
          options.seenAt || new Date().toISOString(),
          { partnerId }
        );
      }
      return customer;
    };

    return this.dbManager ? this.dbManager.transaction(run) : run();
  }
}

module.exports = { CustomerService };
~~~~

### core/domain/OrderService.js

- **Bloco:** Bloco 2 — Camada 2 (Domínio PME, Calendário Dinâmico & Elos 1 e 2)
- **Imports internos (`require` / `import`):** `core/domain/RegionalNormalizer`, `core/storage/DatabaseManager`, `core/storage/repositories/CatalogRepository`, `core/storage/repositories/OrderRepository`
- **Exports principais:** `OrderService`
- **Total de linhas:** 287

~~~~javascript
'use strict';

const { DatabaseManager } = require('../storage/DatabaseManager');
const { OrderRepository } = require('../storage/repositories/OrderRepository');
const { CatalogRepository } = require('../storage/repositories/CatalogRepository');
const { DomainError, formatPriceCents } = require('./RegionalNormalizer');

/**
 * Transactional product-order domain engine implementing Elo 2:
 * - Requires `confirmed === true`
 * - Validates every item belongs to `partnerId`, is active, and has `item_type === 'PRODUCT'`
 * - Ignores any external pricing/totals and calculates `total_cents` strictly from SQLite
 * - Supports `idempotencyKey` and atomic cancellation
 */
class OrderService {
  /**
   * @param {{
   *   dbManager: DatabaseManager,
   *   orderRepository?: OrderRepository,
   *   catalogRepository?: CatalogRepository
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.dbManager) {
      throw new Error('OrderService requires dbManager');
    }
    this.dbManager = deps.dbManager;
    this.orderRepository = deps.orderRepository || new OrderRepository(deps.dbManager);
    this.catalogRepository =
      deps.catalogRepository || new CatalogRepository(deps.dbManager);
  }

  /**
   * Creates a confirmed product order inside a BEGIN IMMEDIATE transaction.
   * Any external price fields (`price`, `priceCents`, `unitPrice`, `totalCents`, `name`)
   * are strictly ignored in favor of authoritative SQLite `catalog_items` values.
   * @param {{
   *   partnerId: string,
   *   items: Array<{ itemId?: string, item_id?: string, catalogItemId?: string, catalog_item_id?: string, qty?: number, quantity?: number, itemVersionHash?: string }>,
   *   clientName: string,
   *   customerPhone?: string | null,
   *   customerId?: string | null,
   *   paymentMethod?: string | null,
   *   deliveryType?: string | null,
   *   address?: string | null,
   *   notes?: string | null,
   *   confirmed: boolean,
   *   idempotencyKey?: string | null
   * }} params
   */
  createOrder(params = {}) {
    const {
      partnerId,
      items,
      clientName: rawClientName,
      customerPhone = null,
      customerId = null,
      paymentMethod = null,
      deliveryType = null,
      address = null,
      notes = null,
      confirmed,
      idempotencyKey = null,
    } = params;

    if (!partnerId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId é obrigatório.');
    }
    if (confirmed !== true) {
      throw new DomainError(
        'CONFIRMATION_REQUIRED',
        'Confirmação explícita (confirmed: true) é obrigatória para concluir o pedido.'
      );
    }
    const clientName = String(rawClientName || '').trim();
    if (!clientName) {
      throw new DomainError('VALIDATION_ERROR', 'clientName é obrigatório.');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'O pedido deve conter ao menos 1 item.'
      );
    }

    return this.dbManager.transaction(() => {
      if (idempotencyKey) {
        const existingByKey = this.orderRepository.findByIdempotencyKey(
          idempotencyKey,
          { partnerId }
        );
        if (existingByKey) {
          return {
            ok: true,
            idempotent: true,
            order: existingByKey,
          };
        }
      }

      const resolvedSnapshots = [];
      let authoritativeTotalCents = 0;

      for (const entry of items) {
        if (!entry || typeof entry !== 'object') {
          throw new DomainError('VALIDATION_ERROR', 'Item de pedido inválido.');
        }

        const itemId =
          entry.itemId ??
          entry.item_id ??
          entry.catalogItemId ??
          entry.catalog_item_id;
        const qty = Number(entry.qty ?? entry.quantity ?? 1);

        if (!itemId) {
          throw new DomainError(
            'VALIDATION_ERROR',
            'Cada item do pedido deve informar itemId.'
          );
        }
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new DomainError(
            'VALIDATION_ERROR',
            `Quantidade inválida para o item "${itemId}": ${qty}.`,
            { itemId, qty }
          );
        }

        const catalogItem = this.catalogRepository.findById(itemId, { partnerId });
        if (!catalogItem) {
          throw new DomainError(
            'CATALOG_NOT_FOUND',
            `Produto "${itemId}" não encontrado para este parceiro.`,
            { partnerId, itemId },
            404
          );
        }
        if (Number(catalogItem.active) !== 1) {
          throw new DomainError(
            'CATALOG_INACTIVE',
            `O produto "${catalogItem.name}" está desativado.`,
            { partnerId, itemId },
            409
          );
        }
        if (catalogItem.item_type !== 'PRODUCT') {
          throw new DomainError(
            'INVALID_ITEM_TYPE',
            `Não é possível pedir "${catalogItem.name}" porque é do tipo ${catalogItem.item_type}, e não PRODUCT.`,
            { partnerId, itemId, itemType: catalogItem.item_type },
            400
          );
        }
        if (
          entry.itemVersionHash &&
          entry.itemVersionHash !== catalogItem.version_hash
        ) {
          throw new DomainError(
            'VERSION_MISMATCH',
            `O produto "${catalogItem.name}" foi atualizado recentemente.`,
            {
              itemId,
              expectedVersionHash: entry.itemVersionHash,
              actualVersionHash: catalogItem.version_hash,
            },
            409
          );
        }

        // Authoritative SQLite price only — external price/total fields are ignored.
        const unitCents = Number(catalogItem.price_cents);
        const subtotalCents = unitCents * qty;
        authoritativeTotalCents += subtotalCents;

        resolvedSnapshots.push({
          catalog_item_id: catalogItem.id,
          name: catalogItem.name,
          price_cents: unitCents,
          qty,
          subtotal_cents: subtotalCents,
          version_hash: catalogItem.version_hash,
        });
      }

      const order = this.orderRepository.create({
        partnerId,
        customerId,
        clientName,
        customerPhone,
        items: resolvedSnapshots,
        totalCents: authoritativeTotalCents,
        paymentMethod,
        deliveryType,
        address,
        notes,
        status: 'CONFIRMED',
        idempotencyKey,
      });

      return {
        ok: true,
        idempotent: false,
        order,
      };
    });
  }

  /**
   * Cancels an order belonging to `partnerId`.
   * @param {{ partnerId: string, orderId: string }} params
   */
  cancelOrder({ partnerId, orderId }) {
    if (!partnerId || !orderId) {
      throw new DomainError('VALIDATION_ERROR', 'partnerId e orderId são obrigatórios.');
    }

    return this.dbManager.transaction(() => {
      const existing = this.orderRepository.findById(orderId, { partnerId });
      if (!existing) {
        throw new DomainError(
          'ORDER_NOT_FOUND',
          `Pedido "${orderId}" não encontrado.`,
          { partnerId, orderId },
          404
        );
      }
      if (existing.status === 'CANCELLED') {
        return { ok: true, alreadyCancelled: true, order: existing };
      }
      const updated = this.orderRepository.cancel(orderId, { partnerId });
      return { ok: true, alreadyCancelled: false, order: updated };
    });
  }

  /**
   * Lists orders for a partner.
   * @param {string} partnerId
   * @param {{ status?: string, limit?: number, offset?: number }} [options]
   */
  listOrders(partnerId, options = {}) {
    return this.orderRepository.listByPartner(partnerId, options);
  }

  /**
   * Computes order summary for a partner (optionally filtered by YYYY-MM-DD prefix on created_at).
   * @param {string} partnerId
   * @param {string | null} [dateStr]
   */
  getSummary(partnerId, dateStr = null) {
    const all = this.orderRepository.listByPartner(partnerId, { limit: 1000 });
    const orders = dateStr
      ? all.filter((o) => String(o.created_at || '').startsWith(dateStr))
      : all;

    let confirmedCount = 0;
    let deliveredCount = 0;
    let cancelledCount = 0;
    let totalRevenueCents = 0;

    for (const ord of orders) {
      if (ord.status === 'CONFIRMED') {
        confirmedCount += 1;
        totalRevenueCents += Number(ord.total_cents || 0);
      } else if (ord.status === 'DELIVERED') {
        deliveredCount += 1;
        totalRevenueCents += Number(ord.total_cents || 0);
      } else if (ord.status === 'CANCELLED') {
        cancelledCount += 1;
      }
    }

    return {
      partnerId,
      dateStr,
      totalCount: orders.length,
      confirmedCount,
      deliveredCount,
      cancelledCount,
      totalRevenueCents,
      totalRevenueLabel: formatPriceCents(totalRevenueCents),
    };
  }
}

module.exports = { OrderService };
~~~~

### core/domain/PdfService.js

- **Bloco:** Bloco 2 — Camada 2 (Domínio PME, Calendário Dinâmico & Elos 1 e 2)
- **Imports internos (`require` / `import`):** `core/domain/RegionalNormalizer`
- **Exports principais:** `PdfService`
- **Total de linhas:** 278

~~~~javascript
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { formatPriceCents, formatFriendly } = require('./RegionalNormalizer');

const MAX_LINE_WIDTH = 85;
const LINES_PER_PAGE = 48;

/**
 * Native PDF 1.4 generator without Puppeteer or headless browsers.
 * Supports in-memory Buffer generation and optional filesystem export.
 */
class PdfService {
  /**
   * @param {{ reportsDir?: string }} [options]
   */
  constructor(options = {}) {
    this.reportsDir = options.reportsDir || null;
  }

  /**
   * Normalizes text to ASCII-safe PDF string literals.
   * @param {string} s
   * @returns {string}
   */
  static escapePdfText(s) {
    const normalized = String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return normalized
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[^\x20-\x7E]/g, '?');
  }

  /**
   * Wraps and flattens content into printable lines.
   * @param {string} content
   * @param {number} [maxWidth=85]
   * @returns {string[]}
   */
  static wrapLines(content, maxWidth = MAX_LINE_WIDTH) {
    const lines = [];
    for (const ln of String(content || '').split(/\r?\n/)) {
      if (ln.length === 0) {
        lines.push('');
        continue;
      }
      for (let i = 0; i < ln.length; i += maxWidth) {
        lines.push(ln.slice(i, i + maxWidth));
      }
    }
    return lines;
  }

  /**
   * Generates a valid PDF 1.4 Buffer in memory (zero headless browser dependency).
   * @param {{ title: string, content: string, author?: string, type?: string, generatedAt?: string }} payload
   * @returns {Buffer}
   */
  generatePdfBuffer({
    title,
    content,
    author = 'Autonmax vNext',
    type = 'RELATORIO',
    generatedAt = new Date().toISOString(),
  }) {
    const headerLines = [
      String(title || 'Relatorio').slice(0, 80),
      `Autor: ${author}`,
      `Tipo: ${type}`,
      `Data: ${generatedAt}`,
      '',
    ];
    const allLines = [...headerLines, ...PdfService.wrapLines(content)];

    const pages = [];
    for (let i = 0; i < allLines.length; i += LINES_PER_PAGE) {
      pages.push(allLines.slice(i, i + LINES_PER_PAGE));
    }
    if (pages.length === 0) {
      pages.push(['']);
    }

    // Object 1: Catalog, Object 2: Pages, Object 3: Font F1, then pairs of (Page, ContentStream)
    const pageObjIds = [];
    const bodyObjects = [];
    let nextId = 4;

    for (const pageLines of pages) {
      const pageId = nextId++;
      const streamId = nextId++;
      pageObjIds.push(pageId);

      const ops = ['BT', '/F1 11 Tf', '50 750 Td'];
      pageLines.forEach((ln, idx) => {
        const escaped = PdfService.escapePdfText(ln);
        if (idx === 0) {
          ops.push(`(${escaped}) Tj`);
        } else {
          ops.push('0 -14 Td');
          ops.push(`(${escaped}) Tj`);
        }
      });
      ops.push('ET');
      const streamContent = ops.join('\n');

      bodyObjects.push(
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${streamId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`
      );
      bodyObjects.push(
        `${streamId} 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`
      );
    }

    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>\nendobj\n`,
      '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
      ...bodyObjects,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += obj;
    }

    const xrefPos = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i += 1) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

    return Buffer.from(pdf, 'utf8');
  }

  /**
   * Generates a PDF and optionally persists it to `outputDir` / `this.reportsDir`.
   * @param {{ title: string, content: string, author?: string, type?: string, outputDir?: string, filename?: string }} options
   */
  generatePdfReport(options) {
    const buffer = this.generatePdfBuffer(options);
    const filename = options.filename || `report_${Date.now()}.pdf`;
    const targetDir = options.outputDir || this.reportsDir;
    let filePath = null;

    if (targetDir) {
      fs.mkdirSync(targetDir, { recursive: true });
      filePath = path.join(targetDir, filename);
      fs.writeFileSync(filePath, buffer);
    }

    return {
      filename,
      filePath,
      sizeBytes: buffer.length,
      buffer,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Builds a daily appointments PDF buffer.
   * @param {{ partnerName: string, dateStr: string, appointments: Array<Record<string, any>> }} params
   */
  buildAppointmentsPdf({ partnerName, dateStr, appointments = [] }) {
    const title = `Agenda Diaria - ${partnerName || 'Estabelecimento'} (${dateStr})`;
    const lines = [
      `Data: ${formatFriendly(dateStr)}`,
      `Total de agendamentos: ${appointments.length}`,
      '------------------------------------------------------------',
    ];

    for (const appt of appointments) {
      lines.push(
        `${appt.time_slot} | ${appt.item_name_snapshot} (${appt.duration_minutes_snapshot} min) | ${appt.client_name} | ${formatPriceCents(appt.price_cents_snapshot)} | ${appt.status}`
      );
    }

    if (appointments.length === 0) {
      lines.push('Nenhum agendamento registrado para esta data.');
    }

    const content = lines.join('\n');
    const buffer = this.generatePdfBuffer({
      title,
      content,
      type: 'AGENDA_DIARIA',
    });

    return { title, content, buffer };
  }

  /**
   * Builds a daily product orders PDF buffer.
   * @param {{ partnerName: string, dateStr: string, orders: Array<Record<string, any>> }} params
   */
  buildOrdersPdf({ partnerName, dateStr, orders = [] }) {
    const title = `Pedidos - ${partnerName || 'Estabelecimento'} (${dateStr || 'Geral'})`;
    let totalConfirmedCents = 0;
    const lines = [
      dateStr ? `Data: ${formatFriendly(dateStr)}` : 'Periodo: Geral',
      `Total de pedidos: ${orders.length}`,
      '------------------------------------------------------------',
    ];

    for (const ord of orders) {
      if (ord.status !== 'CANCELLED') {
        totalConfirmedCents += Number(ord.total_cents || 0);
      }
      const itemsSummary = (ord.items || [])
        .map((it) => `${it.qty}x ${it.name}`)
        .join(', ');
      lines.push(
        `#${ord.id} | ${ord.client_name} | ${itemsSummary} | ${formatPriceCents(ord.total_cents)} | ${ord.status}`
      );
    }

    lines.push('------------------------------------------------------------');
    lines.push(`Total financeiro (nao cancelados): ${formatPriceCents(totalConfirmedCents)}`);

    const content = lines.join('\n');
    const buffer = this.generatePdfBuffer({
      title,
      content,
      type: 'PEDIDOS_DIARIOS',
    });

    return { title, content, buffer };
  }

  /**
   * Builds a deterministic receipt PDF for a confirmed appointment or order.
   * @param {{ kind: 'appointment' | 'order', partnerName: string, record: Record<string, any> }} params
   */
  buildReceiptPdf({ kind, partnerName, record }) {
    const lines = [`Estabelecimento: ${partnerName || 'Estabelecimento'}`];
    let title = 'Comprovante';

    if (kind === 'appointment') {
      title = `Comprovante de Agendamento - ${record.id}`;
      lines.push(`Cliente: ${record.client_name}`);
      lines.push(`Servico: ${record.item_name_snapshot}`);
      lines.push(`Data/Hora: ${formatFriendly(record.date_str, record.time_slot)}`);
      lines.push(`Duracao: ${record.duration_minutes_snapshot} min`);
      lines.push(`Valor: ${formatPriceCents(record.price_cents_snapshot)}`);
      lines.push(`Status: ${record.status}`);
    } else {
      title = `Comprovante de Pedido - ${record.id}`;
      lines.push(`Cliente: ${record.client_name}`);
      for (const item of record.items || []) {
        lines.push(
          `- ${item.qty}x ${item.name} (${formatPriceCents(item.price_cents)} cada) = ${formatPriceCents(item.subtotal_cents ?? item.price_cents * item.qty)}`
        );
      }
      lines.push(`Total: ${formatPriceCents(record.total_cents)}`);
      lines.push(`Status: ${record.status}`);
    }

    const content = lines.join('\n');
    const buffer = this.generatePdfBuffer({
      title,
      content,
      type: kind === 'appointment' ? 'RECIBO_AGENDAMENTO' : 'RECIBO_PEDIDO',
    });

    return { title, content, buffer };
  }
}

module.exports = { PdfService };
~~~~

### core/domain/RegionalNormalizer.js

- **Bloco:** Bloco 2 — Camada 2 (Domínio PME, Calendário Dinâmico & Elos 1 e 2)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `RegionalNormalizer`, `DomainError`, `TZ`, `WEEKDAYS_PT`, `MONTHS_PT`, `stripAccents`, `formatPriceCents`, `formatBrazilianPhone`, `weekdayIndex`, `nowSP`, `addDays`, `buildRollingCalendarSP`, `formatFriendly`, `normalizeTimeSlot`, `slotToMinutes`, `minutesToSlot`, `workingDayIndex`, `parseTimeSlot`, `parseDateStr`, `extractDateTime`
- **Total de linhas:** 575

~~~~javascript
'use strict';

/**
 * RegionalNormalizer — PT-BR regional expression normalization, Sao Paulo
 * timezone calendar/time parsing, phone formatting, and domain error helpers.
 * Transplanted cleanly from core/ring1/MaxEdgeIntelligence.js and core/ring2/BookingDateTime.js.
 */

const TZ = 'America/Sao_Paulo';

const WEEKDAYS_PT = Object.freeze([
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]);

const WEEKDAYS_SHORT = Object.freeze({
  domingo: 0,
  dom: 0,
  segunda: 1,
  seg: 1,
  terca: 2,
  terça: 2,
  ter: 2,
  quarta: 3,
  qua: 3,
  quinta: 4,
  qui: 4,
  sexta: 5,
  sex: 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
});

const MONTHS_PT = Object.freeze([
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]);

const HOUR_WORDS = Object.freeze({
  uma: 1,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
});

const REGIONAL_MAP = [
  [/\buai\b/gi, ' '],
  [/\bsô\b/gi, ' '],
  [/\bmarca pra mim\b/gi, 'quero agendar'],
  [/\bmarca para mim\b/gi, 'quero agendar'],
  [/\bbota na agenda\b/gi, 'quero agendar'],
  [/\btem vaga\b/gi, 'quero agendar horário disponível'],
  [/\bencaixa eu\b/gi, 'quero agendar'],
  [/\bencaixa a?mi?m\b/gi, 'quero agendar'],
  [/\boxente\b/gi, ' '],
  [/\bvou marcar\b/gi, 'quero agendar'],
  [/\bbah\b/gi, ' '],
  [/\btri legal\b/gi, ' '],
  [/\bpode ser\b/gi, 'sim'],
  [/\bfechou\b/gi, 'sim'],
  [/\bvaleu\b/gi, 'obrigado'],
  [/\bblz\b/gi, 'ok'],
  [/\bbeleza\b/gi, 'ok'],
  [/\bshow\b/gi, 'ok'],
  [/\btop\b/gi, 'ok'],
  [/\bquanto fica\b/gi, 'quanto custa'],
  [/\bquanto sai\b/gi, 'quanto custa'],
  [/\bcusta quanto\b/gi, 'quanto custa'],
  [/\btem horário\b/gi, 'horário disponível'],
  [/\btem hora\b/gi, 'horário disponível'],
  [/\bdesmarca\b/gi, 'cancelar'],
  [/\bremarca\b/gi, 'remarcar'],
  [/\bde manh[aã]zinha\b/gi, 'de manhã'],
  [/\bfinzinho de tarde\b/gi, 'final da tarde'],
];

/**
 * Structured domain validation/conflict error aligned with Doc 02 API contracts.
 */
class DomainError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details={}]
   * @param {number} [statusCode=400]
   */
  constructor(code, message, details = {}, statusCode = 400) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    this.statusCode = statusCode;
  }
}

/**
 * Strips diacritics and lowercases text for accent-insensitive PT-BR matching.
 * @param {string} s
 * @returns {string}
 */
function stripAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Formats integer cents to BRL currency string (`R$ XX,XX`).
 * @param {number} cents
 * @returns {string}
 */
function formatPriceCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return `R$ ${(n / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Normalizes a Brazilian phone number or WhatsApp JID into `(XX) XXXXX-XXXX`.
 * @param {string} input
 * @returns {string}
 */
function formatBrazilianPhone(input) {
  if (!input) return '';
  let str = String(input).trim();
  if (str.includes('@')) {
    str = str.split('@')[0];
  }
  let digits = str.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length > 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return str;
}

/**
 * Computes civil weekday index (0=Sun..6=Sat) for `YYYY-MM-DD` in America/Sao_Paulo.
 * @param {string} dateStr
 * @returns {number}
 */
function weekdayIndex(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(probe);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

/**
 * Returns current date/time breakdown in America/Sao_Paulo.
 */
function nowSP(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(referenceDate);

  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  const hh = Number(get('hour') === '24' ? '0' : get('hour'));
  const mm = Number(get('minute'));
  const ss = Number(get('second'));
  const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const weekday = weekdayIndex(dateStr);

  return {
    y,
    m,
    d,
    hh,
    mm,
    ss,
    dateStr,
    weekday,
    timeSlot: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
  };
}

/**
 * Adds `n` civil calendar days to a `YYYY-MM-DD` string.
 * @param {string} dateStr
 * @param {number} n
 * @returns {string}
 */
function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Builds a dynamic 7-day rolling Sao Paulo calendar starting at `nowSP(referenceDate)`.
 * @param {Date | number} [referenceDate]
 */
function buildRollingCalendarSP(referenceDate = new Date()) {
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const current = nowSP(ref);
  const days = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const dateStr = addDays(current.dateStr, offset);
    const weekday = WEEKDAYS_PT[weekdayIndex(dateStr)] || '';
    const relLabel = offset === 0 ? 'Hoje' : offset === 1 ? 'Amanhã' : `+${offset}d`;
    days.push({
      offset,
      relLabel,
      weekday,
      dateStr,
      label: `${relLabel}: ${weekday}, ${dateStr}`,
    });
  }
  return {
    now: current,
    nowWeekday: WEEKDAYS_PT[current.weekday] || '',
    days,
  };
}

/**
 * Formats `YYYY-MM-DD` (and optional `HH:MM`) into readable PT-BR text.
 * @param {string | null | undefined} dateStr
 * @param {string | null | undefined} [timeSlot]
 * @returns {string}
 */
function formatFriendly(dateStr, timeSlot = null) {
  if (!dateStr) return timeSlot ? `às ${timeSlot}` : '';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const wd = WEEKDAYS_PT[weekdayIndex(dateStr)] || '';
  const month = MONTHS_PT[(m || 1) - 1] || '';
  const datePart = `${wd}, ${d} de ${month} de ${y}`;
  return timeSlot ? `${datePart} às ${timeSlot}` : datePart;
}

/**
 * Validates and normalizes `HH:MM` slots.
 * @param {string} slot
 * @returns {string | null}
 */
function normalizeTimeSlot(slot) {
  if (!slot) return null;
  const m = String(slot).trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2] || '0', 10);
  if (Number.isNaN(hh) || Number.isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Converts `HH:MM` to minutes since midnight.
 * @param {string} slot
 * @returns {number | null}
 */
function slotToMinutes(slot) {
  const normalized = normalizeTimeSlot(slot);
  if (!normalized) return null;
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converts minutes since midnight to `HH:MM`.
 * @param {number} mins
 * @returns {string}
 */
function minutesToSlot(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Maps a PT-BR weekday name to index 0=Sun..6=Sat.
 * @param {string} dayName
 * @returns {number | null}
 */
function workingDayIndex(dayName) {
  const n = stripAccents(dayName);
  if (n.startsWith('dom')) return 0;
  if (n.startsWith('seg')) return 1;
  if (n.startsWith('ter')) return 2;
  if (n.startsWith('qua')) return 3;
  if (n.startsWith('qui')) return 4;
  if (n.startsWith('sex')) return 5;
  if (n.startsWith('sab')) return 6;
  return null;
}

/**
 * Parses PT-BR spoken/written time expressions into `HH:MM`.
 * @param {string} text
 * @returns {string | null}
 */
function parseTimeSlot(text) {
  const t = String(text || '').toLowerCase();
  const n = stripAccents(t);
  let timeSlot = null;

  const toPeriodAdjusted = (hour, periodRaw) => {
    let hh = Number(hour);
    const period = stripAccents(periodRaw || '');
    if ((period === 'tarde' || period === 'noite') && hh > 0 && hh < 12) hh += 12;
    if (period === 'manha' && hh === 12) hh = 0;
    if (hh < 0 || hh > 23) return null;
    return hh;
  };

  if (/meio.?dia/i.test(t)) return '12:00';
  if (/meia.?noite/i.test(t)) return '00:00';

  let tm = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (tm) {
    const hh = parseInt(tm[1], 10);
    const mm = parseInt(tm[2], 10);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      timeSlot = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  if (!timeSlot) {
    tm = t.match(/\b(\d{1,2})\s*h\s*(\d{2})?\s*(?:da\s*(manh[aã]|tarde|noite))?/i);
    if (tm) {
      const hh = tm[3] ? toPeriodAdjusted(tm[1], tm[3]) : parseInt(tm[1], 10);
      const mm = tm[2] ? parseInt(tm[2], 10) : 0;
      if (hh != null && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        timeSlot = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
    }
  }

  if (!timeSlot) {
    tm = t.match(
      /(?:[aà]s?\s*)?(\d{1,2})\s*(?:h(?:oras?)?)?\s*(?:da\s*(manh[aã]|tarde|noite))?/i
    );
    if (
      tm &&
      /\d/.test(tm[0]) &&
      (/\bhoras?\b|[aà]s\b|\bh\b|da\s*(manh|tarde|noite)/i.test(tm[0]) ||
        /[aà]s\s*\d/.test(t))
    ) {
      const hh = toPeriodAdjusted(tm[1], tm[2]);
      if (hh != null) timeSlot = `${String(hh).padStart(2, '0')}:00`;
    }
  }

  if (!timeSlot) {
    const words = Object.keys(HOUR_WORDS).join('|');
    const wordRe = new RegExp(
      `\\b(${words})\\b\\s*(?:horas?)?\\s*(?:da\\s*(manh[aã]|tarde|noite))?`,
      'i'
    );
    const wm = n.match(wordRe);
    if (wm) {
      const base = HOUR_WORDS[stripAccents(wm[1])] || HOUR_WORDS[wm[1]];
      if (base) {
        const hh = toPeriodAdjusted(base, wm[2]);
        if (hh != null) timeSlot = `${String(hh).padStart(2, '0')}:00`;
      }
    }
  }

  if (!timeSlot) {
    if (/\b(de\s+)?manh[aã]\b/i.test(t)) timeSlot = '09:00';
    else if (/\b(a|à)?\s*tarde\b/i.test(t)) timeSlot = '14:00';
    else if (/\b(a|à)?\s*noite\b/i.test(t)) timeSlot = '19:00';
  }

  return timeSlot ? normalizeTimeSlot(timeSlot) : null;
}

/**
 * Parses ISO or PT-BR natural date expressions into `YYYY-MM-DD`.
 * @param {string} text
 * @param {string} [refDateStr]
 * @returns {string | null}
 */
function parseDateStr(text, refDateStr) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;

  const isoMatch = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return isoMatch[0];
    }
  }

  const n = stripAccents(t);
  const today = refDateStr || nowSP().dateStr;

  if (/depois\s+de\s+amanh[aã]|depois\s+amanh[aã]/i.test(t)) return addDays(today, 2);
  if (/amanh[aã]/i.test(t)) return addDays(today, 1);
  if (/\bhoje\b/i.test(t)) return today;

  for (const [name, idx] of Object.entries(WEEKDAYS_SHORT)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(n)) {
      const cur = weekdayIndex(today);
      let delta = (idx - cur + 7) % 7;
      if (delta === 0 && !/\bhoje\b/i.test(t)) delta = 7;
      if (/\bpr[oó]xim[ao]\b/i.test(t) && delta === 0) delta = 7;
      return addDays(today, delta);
    }
  }

  const dm = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (dm) {
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10);
    let year = dm[3] ? parseInt(dm[3], 10) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dOnly = t.match(/\bdia\s+(\d{1,2})\b/i);
  if (dOnly) {
    const day = parseInt(dOnly[1], 10);
    const [y, m, td] = today.split('-').map(Number);
    let year = y;
    let month = m;
    if (day < td && td - day > 2) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    if (day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  if (/(pr[oó]ximo\s+dia|pr[oó]xima\s+data)/i.test(t)) return addDays(today, 1);

  return null;
}

/**
 * Extracts `{ dateStr, timeSlot, today, todayFriendly }` from natural PT-BR text.
 * @param {string} text
 * @param {string} [refDateStr]
 */
function extractDateTime(text, refDateStr) {
  const today = refDateStr || nowSP().dateStr;
  return {
    dateStr: parseDateStr(text, today),
    timeSlot: parseTimeSlot(text),
    today,
    todayFriendly: formatFriendly(today, null),
  };
}

/**
 * Normalizes Brazilian Portuguese regionalisms and colloquial booking/order phrases.
 */
class RegionalNormalizer {
  /**
   * @param {string} text
   * @returns {{ text: string, original: string, regionalHits: string[] }}
   */
  normalize(text) {
    const original = String(text || '');
    let result = original;
    const regionalHits = [];

    for (const [re, replacement] of REGIONAL_MAP) {
      if (re.test(result)) {
        regionalHits.push(re.source.slice(0, 40));
        result = result.replace(re, replacement);
      }
      re.lastIndex = 0;
    }

    result = result.replace(/\s+/g, ' ').trim();
    return { text: result, original, regionalHits };
  }
}

RegionalNormalizer.DomainError = DomainError;
RegionalNormalizer.TZ = TZ;
RegionalNormalizer.WEEKDAYS_PT = WEEKDAYS_PT;
RegionalNormalizer.MONTHS_PT = MONTHS_PT;
RegionalNormalizer.stripAccents = stripAccents;
RegionalNormalizer.formatPriceCents = formatPriceCents;
RegionalNormalizer.formatBrazilianPhone = formatBrazilianPhone;
RegionalNormalizer.weekdayIndex = weekdayIndex;
RegionalNormalizer.nowSP = nowSP;
RegionalNormalizer.addDays = addDays;
RegionalNormalizer.buildRollingCalendarSP = buildRollingCalendarSP;
RegionalNormalizer.formatFriendly = formatFriendly;
RegionalNormalizer.normalizeTimeSlot = normalizeTimeSlot;
RegionalNormalizer.slotToMinutes = slotToMinutes;
RegionalNormalizer.minutesToSlot = minutesToSlot;
RegionalNormalizer.workingDayIndex = workingDayIndex;
RegionalNormalizer.parseTimeSlot = parseTimeSlot;
RegionalNormalizer.parseDateStr = parseDateStr;
RegionalNormalizer.extractDateTime = extractDateTime;

module.exports = {
  RegionalNormalizer,
  DomainError,
  TZ,
  WEEKDAYS_PT,
  MONTHS_PT,
  stripAccents,
  formatPriceCents,
  formatBrazilianPhone,
  weekdayIndex,
  nowSP,
  addDays,
  buildRollingCalendarSP,
  formatFriendly,
  normalizeTimeSlot,
  slotToMinutes,
  minutesToSlot,
  workingDayIndex,
  parseTimeSlot,
  parseDateStr,
  extractDateTime,
};
~~~~

## Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)

### core/ai/AgentEngine.js

- **Bloco:** Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)
- **Imports internos (`require` / `import`):** `core/ai/AtomicOutputGuard`, `core/ai/InputGuard`, `core/ai/LlmRouter`, `core/ai/PromptPin`, `core/domain/BookingService`, `core/domain/CatalogService`, `core/domain/CustomerService`, `core/domain/OrderService`, `core/domain/RegionalNormalizer`, `core/storage/repositories/AppointmentRepository`, `core/storage/repositories/ConversationRepository`, `core/storage/repositories/OrderRepository`, `core/storage/repositories/PartnerRepository`
- **Exports principais:** `AgentEngine`, `AGENT_TOOL_DEFINITIONS`, `DEFAULT_MAX_CONTEXT_TOKENS`, `HYBRID_OFFERING_NOTICE`, `analyzeCatalogOfferings`, `estimateTokens`
- **Total de linhas:** 910

~~~~javascript
'use strict';

const { PartnerRepository } = require('../storage/repositories/PartnerRepository');
const { ConversationRepository } = require('../storage/repositories/ConversationRepository');
const { AppointmentRepository } = require('../storage/repositories/AppointmentRepository');
const { OrderRepository } = require('../storage/repositories/OrderRepository');
const { CatalogService } = require('../domain/CatalogService');
const { BookingService } = require('../domain/BookingService');
const { OrderService } = require('../domain/OrderService');
const { CustomerService } = require('../domain/CustomerService');
const {
  RegionalNormalizer,
  TZ,
  buildRollingCalendarSP,
} = require('../domain/RegionalNormalizer');
const { PromptPin } = require('./PromptPin');
const { InputGuard } = require('./InputGuard');
const { LlmRouter, MAX_TOOL_ITERATIONS } = require('./LlmRouter');
const { AtomicOutputGuard } = require('./AtomicOutputGuard');

const DEFAULT_MAX_CONTEXT_TOKENS = 4096;
const HYBRID_OFFERING_NOTICE =
  'Oferecemos produtos e serviços — sobre qual dos dois deseja informações?';

/**
 * Deterministically inspects SQLite catalog items to classify what the PME offers.
 * @param {Array<Record<string, any>>} catalogItems
 */
function analyzeCatalogOfferings(catalogItems = []) {
  const services = [];
  const products = [];
  for (const item of catalogItems) {
    const t = String(item?.item_type || item?.type || '').toUpperCase();
    if (t === 'SERVICE') services.push(item);
    else if (t === 'PRODUCT') products.push(item);
  }
  const hasServices = services.length > 0;
  const hasProducts = products.length > 0;
  const isHybrid = hasServices && hasProducts;
  const mode = isHybrid
    ? 'HYBRID'
    : hasServices
      ? 'SERVICES_ONLY'
      : hasProducts
        ? 'PRODUCTS_ONLY'
        : 'EMPTY';
  return {
    mode,
    isHybrid,
    hasServices,
    hasProducts,
    servicesCount: services.length,
    productsCount: products.length,
  };
}

/**
 * Conservative token estimator (~4 chars per token).
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  const s = String(text || '');
  return s.length === 0 ? 0 : Math.ceil(s.length / 4);
}

/**
 * Tool schemas locked by `item_id` (Doc 01 Section 3 Elo 2).
 */
const AGENT_TOOL_DEFINITIONS = Object.freeze([
  {
    name: 'get_item_spec',
    description:
      'Retorna a especificação exata (nome, tipo, preço em centavos, duração) de um item do catálogo pelo item_id.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID canônico do item no catálogo.' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'check_available_slots',
    description:
      'Consulta horários livres para um serviço (item_type = SERVICE) em uma data YYYY-MM-DD do calendário oficial em tempo real (nunca use datas passadas).',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'ID do serviço no catálogo.' },
        date_str: {
          type: 'string',
          description:
            'Data desejada (YYYY-MM-DD ou expressão PT-BR), usando obrigatoriamente o ano e data da tabela de calendário oficial.',
        },
      },
      required: ['item_id', 'date_str'],
    },
  },
  {
    name: 'book_service',
    description:
      'Registra um agendamento no SQLite. Exige item_type SERVICE e data/horário futuro em America/Sao_Paulo. NUNCA chame no mesmo turno em que perguntar "Posso confirmar?" ou "Posso finalizar?"; envie confirmed=true SOMENTE após o cliente confirmar explicitamente em uma mensagem anterior.',
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        date_str: {
          type: 'string',
          description: 'Data no formato YYYY-MM-DD conforme a tabela oficial do calendário em tempo real.',
        },
        time_slot: { type: 'string', description: 'Horário futuro no formato HH:MM.' },
        client_name: { type: 'string' },
        confirmed: {
          type: 'boolean',
          description: 'Use true SOMENTE após o cliente confirmar explicitamente o resumo do agendamento.',
        },
        idempotency_key: { type: 'string' },
      },
      required: ['item_id', 'date_str', 'time_slot', 'client_name', 'confirmed'],
    },
  },
  {
    name: 'create_order',
    description:
      'Registra um pedido de produtos (item_type = PRODUCT) calculando o total no banco. NUNCA chame no mesmo turno em que perguntar "Posso confirmar?" ou "Posso finalizar?"; envie confirmed=true SOMENTE após o cliente confirmar explicitamente o resumo do pedido.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'string' },
              qty: { type: 'integer' },
            },
            required: ['item_id', 'qty'],
          },
        },
        client_name: { type: 'string' },
        delivery_type: { type: 'string' },
        address: { type: 'string' },
        payment_method: { type: 'string' },
        confirmed: {
          type: 'boolean',
          description: 'Use true SOMENTE após o cliente confirmar explicitamente o resumo do pedido.',
        },
        idempotency_key: { type: 'string' },
      },
      required: ['items', 'client_name', 'confirmed'],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancela um agendamento existente pelo ID e libera o horário.',
    parameters: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string' },
      },
      required: ['appointment_id'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancela um pedido existente pelo ID.',
    parameters: {
      type: 'object',
      properties: {
        order_id: { type: 'string' },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'list_customer_records',
    description: 'Lista os agendamentos e pedidos do cliente atual neste estabelecimento.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
]);

function buildPostCommitFallbackText(committedTransactions = []) {
  const hasOrder = committedTransactions.some((c) => c.type === 'order');
  const hasAppt = committedTransactions.some((c) => c.type === 'appointment');
  if (hasOrder && hasAppt) {
    return 'Perfeito! Sua solicitação foi confirmada com sucesso.';
  }
  if (hasOrder) {
    return 'Perfeito! Seu pedido foi confirmado com sucesso.';
  }
  return 'Perfeito! Seu agendamento foi confirmado com sucesso.';
}

/**
 * Conversational AI Turn Orchestrator:
 * - Verifies PromptPin on boot/context build
 * - Sanitizes inputs with InputGuard and normalizes PT-BR expressions
 * - Builds token-budgeted context from SQLite (`messages` + `customers.facts_json` + catalog)
 * - Runs bounded Function Calling loop (max 3 iterations) via LlmRouter
 * - Validates output via AtomicOutputGuard (Elo 3) before persistence/reply
 */
class AgentEngine {
  /**
   * @param {{
   *   dbManager: import('../storage/DatabaseManager').DatabaseManager,
   *   llmRouter?: LlmRouter,
   *   promptPin?: PromptPin,
   *   inputGuard?: InputGuard,
   *   outputGuard?: AtomicOutputGuard,
   *   regionalNormalizer?: RegionalNormalizer,
   *   catalogService?: CatalogService,
   *   bookingService?: BookingService,
   *   orderService?: OrderService,
   *   customerService?: CustomerService,
   *   partnerRepository?: PartnerRepository,
   *   conversationRepository?: ConversationRepository,
   *   appointmentRepository?: AppointmentRepository,
   *   orderRepository?: OrderRepository,
   *   maxContextTokens?: number,
   *   maxToolIterations?: number,
   *   tokenEstimator?: (text: string) => number
   * }} deps
   */
  constructor(deps = {}) {
    if (!deps.dbManager) {
      throw new Error('AgentEngine requires dbManager');
    }

    this.dbManager = deps.dbManager;
    this.partnerRepository =
      deps.partnerRepository || new PartnerRepository(deps.dbManager);
    this.conversationRepository =
      deps.conversationRepository || new ConversationRepository(deps.dbManager);
    this.appointmentRepository =
      deps.appointmentRepository || new AppointmentRepository(deps.dbManager);
    this.orderRepository =
      deps.orderRepository || new OrderRepository(deps.dbManager);

    this.nowFn = typeof deps.nowFn === 'function' ? deps.nowFn : null;
    this.catalogService =
      deps.catalogService || new CatalogService({ dbManager: deps.dbManager });
    this.bookingService =
      deps.bookingService ||
      new BookingService({
        dbManager: deps.dbManager,
        appointmentRepository: this.appointmentRepository,
        partnerRepository: this.partnerRepository,
        nowFn: this.nowFn,
      });
    this.orderService =
      deps.orderService ||
      new OrderService({
        dbManager: deps.dbManager,
        orderRepository: this.orderRepository,
      });
    this.customerService =
      deps.customerService || new CustomerService({ dbManager: deps.dbManager });

    this.promptPin = deps.promptPin || new PromptPin();
    this.inputGuard = deps.inputGuard || new InputGuard();
    this.outputGuard = deps.outputGuard || new AtomicOutputGuard();
    this.regionalNormalizer = deps.regionalNormalizer || new RegionalNormalizer();
    this.llmRouter = deps.llmRouter || new LlmRouter();

    this.maxContextTokens = Number.isInteger(deps.maxContextTokens)
      ? deps.maxContextTokens
      : DEFAULT_MAX_CONTEXT_TOKENS;
    this.maxToolIterations = Math.min(
      MAX_TOOL_ITERATIONS,
      Number.isInteger(deps.maxToolIterations)
        ? deps.maxToolIterations
        : MAX_TOOL_ITERATIONS
    );
    this.tokenEstimator = deps.tokenEstimator || estimateTokens;
  }

  /**
   * Returns canonical Function Calling tool definitions.
   */
  getToolDefinitions() {
    return AGENT_TOOL_DEFINITIONS;
  }

  /**
   * Builds system prompt and token-budgeted conversation history from SQLite.
   * @param {{ partnerId: string, customerId?: string | null, conversationId: string, currentUserMessage: string, historyLimit?: number }} params
   */
  buildContext({
    partnerId,
    customerId = null,
    conversationId,
    currentUserMessage,
    historyLimit = 50,
  }) {
    const basePrompt = this.promptPin.getBasePrompt();
    const partner = this.partnerRepository.findById(partnerId);
    const catalogItems = this.catalogService.listItems(partnerId);
    const offeringSummary = analyzeCatalogOfferings(catalogItems);
    const customer = customerId
      ? this.customerService.findByExternal
        ? this.customerService.getCustomer(partnerId, customerId)
        : null
      : null;

    const catalogBlock =
      catalogItems.length > 0
        ? catalogItems.map((it) => CatalogService.formatContextLine(it)).join('\n')
        : '(Nenhum item ativo cadastrado no catálogo)';

    const offeringDirective = (() => {
      if (offeringSummary.mode === 'HYBRID') {
        return `[OFERTA: HÍBRIDO (${offeringSummary.servicesCount} serviço(s), ${offeringSummary.productsCount} produto(s))] SERVICE->book_service; PRODUCT->create_order; se pedir ambos juntos, confirme UM POR VEZ; 2ª msg->"${HYBRID_OFFERING_NOTICE}"`;
      }
      if (offeringSummary.mode === 'SERVICES_ONLY') {
        return `[OFERTA: SOMENTE SERVIÇOS (${offeringSummary.servicesCount})] Nunca use create_order.`;
      }
      if (offeringSummary.mode === 'PRODUCTS_ONLY') {
        return `[OFERTA: SOMENTE PRODUTOS (${offeringSummary.productsCount})] Nunca use check_available_slots/book_service.`;
      }
      return '[OFERTA: VAZIO] Não invente itens ou preços.';
    })();

    const pdfBlock =
      Array.isArray(partner?.pdf_files) && partner.pdf_files.length > 0
        ? `[MATERIAIS EM PDF]\n${partner.pdf_files
            .map((p, idx) => {
              const name = p?.name || p?.filename || `documento_${idx + 1}.pdf`;
              const excerpt = p?.text || p?.content || p?.excerpt || '';
              return excerpt
                ? `- ${name}: ${String(excerpt).slice(0, 600)}`
                : `- ${name}`;
            })
            .join('\n')}`
        : '';

    const imageBlock =
      Array.isArray(partner?.image_files) && partner.image_files.length > 0
        ? `[IMAGENS DO ESTABELECIMENTO]\n${partner.image_files
            .map((img, idx) => {
              const name = img?.name || img?.filename || `imagem_${idx + 1}`;
              const desc = img?.description ? ` — ${img.description}` : '';
              return `- ${name}${desc}`;
            })
            .join('\n')}`
        : '';

    const calendar = buildRollingCalendarSP(this.nowFn ? this.nowFn() : new Date());
    const calendarBlock = [
      `[CALENDÁRIO OFICIAL EM TEMPO REAL — ${TZ}] ${calendar.now.timeSlot}`,
      calendar.days.map((d) => d.label).join(' | '),
      'Use só ano e datas ISO acima.',
    ].join('\n');

    const partnerSections = [
      basePrompt,
      calendarBlock,
      partner
        ? `\n[ESTABELECIMENTO]\nNome: ${partner.display_name}${partner.store_segment ? ` (${partner.store_segment})` : ''}`
        : '',
      partner?.personality_prompt
        ? `[PERSONALIDADE SOBERANA DO PARCEIRO]\n${partner.personality_prompt}`
        : '',
      partner?.business_rules
        ? `[REGRAS DO NEGÓCIO]\n${partner.business_rules}`
        : '',
      partner?.working_hours
        ? `[HORÁRIO DE FUNCIONAMENTO]\n${JSON.stringify(partner.working_hours)}`
        : '',
      partner?.policies
        ? `[POLÍTICAS]\n${JSON.stringify(partner.policies)}`
        : '',
      pdfBlock,
      imageBlock,
      `[CATÁLOGO OFICIAL]\n${catalogBlock}`,
      customer && customer.facts && Object.keys(customer.facts).length > 0
        ? `[FATOS DO CLIENTE]\n${JSON.stringify(customer.facts)}`
        : '',
      offeringDirective,
    ]
      .filter(Boolean)
      .join('\n\n');

    let systemPrompt = partnerSections;
    const rawHistory = this.conversationRepository.getRecentMessages(
      conversationId,
      historyLimit
    );
    const assistantTurnCount = rawHistory.filter(
      (m) => m.direction === 'OUTBOUND' || m.role === 'assistant'
    ).length;

    const userMsgTokens = this.tokenEstimator(currentUserMessage);
    let systemTokens = this.tokenEstimator(systemPrompt);

    // Reserve budget for current user message; trim system prompt only if absurdly large
    const maxSystemTokens = Math.max(0, this.maxContextTokens - userMsgTokens);
    if (systemTokens > maxSystemTokens && maxSystemTokens > 0) {
      systemPrompt = systemPrompt.slice(0, maxSystemTokens * 4);
      systemTokens = this.tokenEstimator(systemPrompt);
    }

    const availableHistoryTokens = Math.max(
      0,
      this.maxContextTokens - systemTokens - userMsgTokens
    );

    // Pack most recent history messages backwards without exceeding token budget
    const packedReverse = [];
    let usedHistoryTokens = 0;

    for (let i = rawHistory.length - 1; i >= 0; i -= 1) {
      const msg = rawHistory[i];
      const msgContent = String(msg.content || '');
      const msgTokens = this.tokenEstimator(msgContent);
      if (usedHistoryTokens + msgTokens > availableHistoryTokens) {
        break;
      }
      packedReverse.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msgContent,
      });
      usedHistoryTokens += msgTokens;
    }

    const historyMessages = packedReverse.reverse();

    return {
      systemPrompt,
      historyMessages,
      catalogItems,
      offeringSummary,
      assistantTurnCount,
      partner,
      customer,
      tokensEstimated: systemTokens + usedHistoryTokens + userMsgTokens,
    };
  }

  /**
   * Executes a single locked domain tool call scoped strictly to `partnerId`.
   * @private
   */
  async _executeTool(toolCall, context) {
    const name = toolCall.name;
    const args = toolCall.arguments || {};
    const { partnerId, customerId, customerPhone, defaultClientName } = context;

    try {
      switch (name) {
        case 'get_item_spec': {
          const item = this.catalogService.getItemSpec(partnerId, args.item_id);
          return { ok: true, item, price_cents: item.price_cents };
        }
        case 'check_available_slots': {
          const item = this.catalogService.getItemSpec(partnerId, args.item_id);
          if (item.item_type !== 'SERVICE') {
            this.partnerRepository.recordAudit({
              partnerId,
              eventType: 'WRONG_FLOW_INTERCEPTED',
              severity: 'WARN',
              message: `Attempted check_available_slots on ${item.item_type} (${item.id})`,
              metadata: { tool: name, itemId: item.id, itemType: item.item_type },
            });
            return {
              ok: false,
              code: 'WRONG_FLOW_USE_CREATE_ORDER',
              expectedFlow: 'order',
              actualItemType: item.item_type,
              itemName: item.name,
              error: `FLUXO INCORRETO: "${item.name}" é um PRODUCT, não um SERVICE. Use create_order em vez de consultar horários.`,
            };
          }
          return this.bookingService.checkAvailableSlots({
            partnerId,
            itemId: args.item_id,
            dateStr: args.date_str,
          });
        }
        case 'book_service': {
          const item = this.catalogService.getItemSpec(partnerId, args.item_id);
          if (item.item_type !== 'SERVICE') {
            this.partnerRepository.recordAudit({
              partnerId,
              eventType: 'WRONG_FLOW_INTERCEPTED',
              severity: 'WARN',
              message: `Attempted book_service on ${item.item_type} (${item.id})`,
              metadata: { tool: name, itemId: item.id, itemType: item.item_type },
            });
            return {
              ok: false,
              code: 'WRONG_FLOW_USE_CREATE_ORDER',
              expectedFlow: 'order',
              actualItemType: item.item_type,
              itemName: item.name,
              error: `FLUXO INCORRETO: "${item.name}" é um PRODUCT. É proibido agendar produto em book_service; use create_order.`,
            };
          }
          const res = this.bookingService.bookService({
            partnerId,
            itemId: args.item_id,
            dateStr: args.date_str,
            timeSlot: args.time_slot,
            clientName: args.client_name || defaultClientName,
            customerPhone,
            customerId,
            confirmed: args.confirmed,
            idempotencyKey: args.idempotency_key || null,
          });
          return { ...res, committed: true };
        }
        case 'create_order': {
          const orderItems = Array.isArray(args.items) ? args.items : [];
          for (const entry of orderItems) {
            const targetId = entry?.item_id ?? entry?.itemId ?? entry?.catalog_item_id;
            if (!targetId) continue;
            const item = this.catalogService.getItemSpec(partnerId, targetId);
            if (item.item_type !== 'PRODUCT') {
              this.partnerRepository.recordAudit({
                partnerId,
                eventType: 'WRONG_FLOW_INTERCEPTED',
                severity: 'WARN',
                message: `Attempted create_order on ${item.item_type} (${item.id})`,
                metadata: { tool: name, itemId: item.id, itemType: item.item_type },
              });
              return {
                ok: false,
                code: 'WRONG_FLOW_USE_BOOK_SERVICE',
                expectedFlow: 'booking',
                actualItemType: item.item_type,
                itemName: item.name,
                error: `FLUXO INCORRETO: "${item.name}" é um SERVICE. É proibido registrar serviço em create_order; use check_available_slots e book_service.`,
              };
            }
          }
          const res = this.orderService.createOrder({
            partnerId,
            items: args.items,
            clientName: args.client_name || defaultClientName,
            customerPhone,
            customerId,
            deliveryType: args.delivery_type || null,
            address: args.address || null,
            paymentMethod: args.payment_method || null,
            confirmed: args.confirmed,
            idempotencyKey: args.idempotency_key || null,
          });
          return { ...res, committed: true };
        }
        case 'cancel_appointment': {
          return this.bookingService.cancelAppointment({
            partnerId,
            appointmentId: args.appointment_id,
          });
        }
        case 'cancel_order': {
          return this.orderService.cancelOrder({
            partnerId,
            orderId: args.order_id,
          });
        }
        case 'list_customer_records': {
          if (!customerId) {
            return { ok: true, appointments: [], orders: [] };
          }
          const appointments = this.appointmentRepository.listByCustomer(
            customerId,
            { partnerId, limit: 20 }
          );
          const orders = this.orderRepository.listByCustomer(customerId, {
            partnerId,
            limit: 20,
          });
          return { ok: true, appointments, orders };
        }
        default:
          return {
            ok: false,
            error: `UNKNOWN_TOOL: ${name}`,
          };
      }
    } catch (err) {
      return {
        ok: false,
        code: err?.code || 'TOOL_ERROR',
        error: err?.message || 'Tool execution failed',
      };
    }
  }

  /**
   * Runs one full conversational turn: InputGuard -> Persist INBOUND -> ContextBuilder ->
   * Function Calling Loop (max 3) -> AtomicOutputGuard (Elo 3) -> Persist OUTBOUND.
   * @param {{
   *   partnerId: string,
   *   conversationId: string,
   *   customerId?: string | null,
   *   customerPhone?: string | null,
   *   clientName?: string | null,
   *   message: string,
   *   blockHighRiskInjection?: boolean,
   *   signal?: AbortSignal
   * }} params
   */
  async processTurn(params = {}) {
    const {
      partnerId,
      conversationId,
      customerId = null,
      customerPhone = null,
      clientName = null,
      message,
      blockHighRiskInjection = true,
      signal,
    } = params;

    if (!partnerId || !conversationId) {
      throw new Error('AgentEngine.processTurn requires partnerId and conversationId');
    }

    // 1. InputGuard
    const inspection = this.inputGuard.inspect(message, {
      blockHighRisk: blockHighRiskInjection,
    });
    if (inspection.blocked) {
      this.partnerRepository.recordAudit({
        partnerId,
        eventType: 'PROMPT_INJECTION_BLOCKED',
        severity: 'WARN',
        message: 'High-risk prompt injection attempt blocked by InputGuard',
        metadata: { conversationId, matches: inspection.risk.matches },
      });
      return {
        ok: false,
        blocked: true,
        reason: 'PROMPT_INJECTION_BLOCKED',
        text: 'Desculpe, não consegui compreender sua solicitação. Como posso ajudar com nossos serviços ou produtos?',
        toolResults: [],
        committedTransactions: [],
      };
    }

    // 2. Build context BEFORE appending current inbound message so history avoids duplicating current turn
    const normalized = this.regionalNormalizer.normalize(inspection.sanitized);
    const context = this.buildContext({
      partnerId,
      customerId,
      conversationId,
      currentUserMessage: inspection.sanitized,
    });

    // 3. Persist INBOUND message in SQLite
    this.conversationRepository.addMessage({
      conversationId,
      partnerId,
      direction: 'INBOUND',
      role: 'user',
      content: inspection.sanitized,
      metadata:
        normalized.regionalHits.length > 0
          ? { regionalHits: normalized.regionalHits }
          : {},
    });

    const userTurnContent =
      normalized.text && normalized.text !== inspection.sanitized
        ? `${inspection.sanitized}\n[Normalizado PT-BR: ${normalized.text}]`
        : inspection.sanitized;

    const loopMessages = [
      ...context.historyMessages,
      { role: 'user', content: userTurnContent },
    ];

    // 4. Function Calling loop (strictly capped at MAX_TOOL_ITERATIONS = 3)
    const toolResults = [];
    const committedTransactions = [];
    const seenCallSignatures = new Map();
    let turnCommittedFlow = null; // 'booking' | 'order' — enforces 1 flow commit per turn
    let candidateText = '';
    let providerUsed = null;
    let model = null;

    for (let iter = 0; iter < this.maxToolIterations; iter += 1) {
      const llmRes = await this.llmRouter.generate({
        systemPrompt: context.systemPrompt,
        messages: loopMessages,
        tools: AGENT_TOOL_DEFINITIONS,
        signal,
      });

      providerUsed = llmRes.providerUsed;
      model = llmRes.model;

      const toolCalls = Array.isArray(llmRes.toolCalls) ? llmRes.toolCalls : [];
      const isLlmFallback = llmRes.ok === false || llmRes.status === 'LOCAL_FALLBACK';
      if (toolCalls.length === 0) {
        if (committedTransactions.length > 0 && (isLlmFallback || !String(llmRes.text || '').trim())) {
          candidateText = buildPostCommitFallbackText(committedTransactions);
        } else {
          candidateText = llmRes.text || '';
        }
        break;
      }

      loopMessages.push({
        role: 'assistant',
        content: llmRes.text || '',
        toolCalls,
        rawParts: llmRes.rawParts || null,
      });

      const hasBookInBatch = toolCalls.some((tc) => tc.name === 'book_service');
      const hasOrderInBatch = toolCalls.some((tc) => tc.name === 'create_order');
      const batchMixesCommitFlows = hasBookInBatch && hasOrderInBatch;

      let loopAborted = false;
      for (const tc of toolCalls) {
        const sig = `${tc.name}:${JSON.stringify(tc.arguments || {})}`;
        const prevCount = seenCallSignatures.get(sig) || 0;
        if (prevCount >= 2) {
          loopAborted = true;
          break;
        }
        seenCallSignatures.set(sig, prevCount + 1);

        let result;
        const isCommitTool = tc.name === 'book_service' || tc.name === 'create_order';
        const tcFlow = tc.name === 'book_service' ? 'booking' : tc.name === 'create_order' ? 'order' : null;
        if (
          isCommitTool &&
          (batchMixesCommitFlows || (turnCommittedFlow && turnCommittedFlow !== tcFlow))
        ) {
          this.partnerRepository.recordAudit({
            partnerId,
            eventType: 'MIXED_FLOW_INTERCEPTED',
            severity: 'WARN',
            message: `Blocked simultaneous booking + order in same turn (${tc.name})`,
            metadata: { conversationId, tool: tc.name, turnCommittedFlow, batchMixesCommitFlows },
          });
          result = {
            ok: false,
            code: 'MIXED_COMMIT_BLOCKED',
            error:
              'TRAVA DE SEGURANÇA (UM POR VEZ): Não é permitido confirmar serviço e produto no mesmo turno. Peça educadamente para o cliente confirmar um por vez (primeiro o serviço ou primeiro o produto).',
          };
        } else {
          result = await this._executeTool(tc, {
            partnerId,
            customerId,
            customerPhone,
            defaultClientName: clientName || context.customer?.name || 'Cliente',
          });
        }

        toolResults.push({ toolName: tc.name, arguments: tc.arguments, result });

        if (result && result.ok && result.committed) {
          if (tc.name === 'book_service' && result.appointment) {
            turnCommittedFlow = 'booking';
            committedTransactions.push({
              type: 'appointment',
              toolName: tc.name,
              record: result.appointment,
            });
          } else if (tc.name === 'create_order' && result.order) {
            turnCommittedFlow = 'order';
            committedTransactions.push({
              type: 'order',
              toolName: tc.name,
              record: result.order,
            });
          }
        }

        loopMessages.push({
          role: 'tool',
          toolCallId: tc.id,
          name: tc.name,
          content: JSON.stringify(result),
        });
      }

      if (loopAborted) {
        candidateText =
          committedTransactions.length > 0
            ? buildPostCommitFallbackText(committedTransactions)
            : llmRes.text ||
              'Preciso confirmar mais detalhes com você antes de prosseguir.';
        break;
      }

      // If this was the last allowed tool iteration, request one final textual synthesis without tools
      if (iter === this.maxToolIterations - 1) {
        const finalRes = await this.llmRouter.generate({
          systemPrompt: context.systemPrompt,
          messages: loopMessages,
          tools: [],
          signal,
        });
        providerUsed = finalRes.providerUsed;
        model = finalRes.model;
        const isFinalFallback = finalRes.ok === false || finalRes.status === 'LOCAL_FALLBACK';
        if (
          committedTransactions.length > 0 &&
          (isFinalFallback || !String(finalRes.text || '').trim())
        ) {
          candidateText = buildPostCommitFallbackText(committedTransactions);
        } else {
          candidateText = finalRes.text || '';
        }
      }
    }

    // 5. Elo 3 — AtomicOutputGuard (< 2ms)
    const guard = this.outputGuard.validate({
      text: candidateText,
      catalogItems: context.catalogItems,
      toolResults,
      committedTransactions,
    });

    if (guard.blocked) {
      this.partnerRepository.recordAudit({
        partnerId,
        eventType: 'SYSTEM_GUARD_TRIGGERED',
        severity: 'WARN',
        message: `AtomicOutputGuard blocked output: ${guard.reason}`,
        metadata: {
          conversationId,
          reason: guard.reason,
          originalText: guard.originalText,
        },
      });

      return {
        ok: false,
        blocked: true,
        reason: guard.reason,
        text: guard.text,
        guard,
        toolResults,
        committedTransactions,
        providerUsed,
        model,
        tokensEstimated: context.tokensEstimated,
      };
    }

    let finalReplyText = guard.text;
    const isSecondAssistantReply = context.assistantTurnCount === 1;
    if (
      context.offeringSummary?.isHybrid &&
      isSecondAssistantReply &&
      !/oferecemos.*produtos.*servi[cç]os|oferecemos.*servi[cç]os.*produtos/i.test(
        finalReplyText
      )
    ) {
      finalReplyText = finalReplyText
        ? `${finalReplyText}\n\n${HYBRID_OFFERING_NOTICE}`
        : HYBRID_OFFERING_NOTICE;
    }

    // 6. Persist OUTBOUND assistant message in SQLite
    this.conversationRepository.addMessage({
      conversationId,
      partnerId,
      direction: 'OUTBOUND',
      role: 'assistant',
      content: finalReplyText,
      metadata: {
        providerUsed,
        model,
        committedCount: committedTransactions.length,
        offeringMode: context.offeringSummary?.mode || 'EMPTY',
      },
    });

    return {
      ok: true,
      blocked: false,
      reason: null,
      text: finalReplyText,
      receipts: guard.receipts,
      guard,
      toolResults,
      committedTransactions,
      offeringSummary: context.offeringSummary,
      providerUsed,
      model,
      tokensEstimated: context.tokensEstimated,
    };
  }
}

AgentEngine.analyzeCatalogOfferings = analyzeCatalogOfferings;
AgentEngine.HYBRID_OFFERING_NOTICE = HYBRID_OFFERING_NOTICE;

module.exports = {
  AgentEngine,
  AGENT_TOOL_DEFINITIONS,
  DEFAULT_MAX_CONTEXT_TOKENS,
  HYBRID_OFFERING_NOTICE,
  analyzeCatalogOfferings,
  estimateTokens,
};
~~~~

### core/ai/AtomicOutputGuard.js

- **Bloco:** Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)
- **Imports internos (`require` / `import`):** `core/domain/RegionalNormalizer`
- **Exports principais:** `AtomicOutputGuard`, `extractBrlMentions`, `detectConfirmationClaim`, `formatDeterministicReceipt`
- **Total de linhas:** 392

~~~~javascript
'use strict';

const { formatFriendly, formatPriceCents } = require('../domain/RegionalNormalizer');

const QUESTION_CLAUSE_RE =
  /\b(posso|quer|deseja|gostaria|vamos|pode)\s+confirmar\b[^.!\n]*\??/gi;

const BOOKING_CONFIRM_CLAIM_RES = [
  /\b(agendamento|hor[aá]rio|reserva|atendimento)\s+(?:j[aá]\s+)?(?:foi\s+|est[aá]\s+)?(confirmad[oa]|agendad[oa]|marcad[oa]|anotad[oa]|registrad[oa]|conclu[ií]d[oa])\b/i,
  /\b(?:acabei\s+de\s+|j[aá]\s+)?(?:agendei|marquei|confirmei|registrei)\s+(?:o\s+seu|seu|sua|a\s+sua|o|a)\s+(?:hor[aá]rio|agendamento|consulta|atendimento|servi[cç]o)\b/i,
  /\b(?:est[aá]|ficou)\s+(?:tudo\s+)?(agendad[oa]|marcad[oa])\b/i,
];

const ORDER_CONFIRM_CLAIM_RES = [
  /\b(pedido|compra|encomenda)\s+(?:j[aá]\s+)?(?:foi\s+|est[aá]\s+)?(confirmad[oa]|anotad[oa]|registrad[oa]|conclu[ií]d[oa]|fechad[oa]|realizad[oa])\b/i,
  /\b(?:acabei\s+de\s+|j[aá]\s+)?(?:confirmei|anotei|registrei|fechei)\s+(?:o\s+seu|seu|sua|o)\s+(?:pedido|compra|encomenda)\b/i,
];

const GENERIC_CONFIRM_CLAIM_RES = [
  /^\s*(?:agendamento|pedido|reserva|hor[aá]rio)?\s*confirmad[oa]\s*[!.]/i,
  /\bconfirmad[oa]\s*(?:com\s+sucesso|para\s+(?:o\s+dia|amanh[aã]|hoje|\d)|no\s+dia|às|!)/i,
  /\b(?:est[aá]|ficou)\s+confirmad[oa]\b/i,
];

/**
 * Parses Brazilian currency mentions (`R$ 50,00`, `R$ 1.250,50`, `R$ 10`) into integer cents.
 * @param {string} text
 * @returns {Array<{ raw: string, cents: number }>}
 */
function extractBrlMentions(text) {
  const results = [];
  const re = /R\$\s*(\d+(?:[.,]\d{1,3})*(?:[.,]\d{1,2})?)/gi;
  let match;

  while ((match = re.exec(String(text || ''))) !== null) {
    const rawNum = match[1];
    let cents = null;

    if (rawNum.includes(',')) {
      const cleaned = rawNum.replace(/\./g, '');
      const [wholeStr, decStr = ''] = cleaned.split(',');
      const whole = parseInt(wholeStr, 10);
      const dec = parseInt(decStr.padEnd(2, '0').slice(0, 2), 10);
      if (!Number.isNaN(whole) && !Number.isNaN(dec)) {
        cents = whole * 100 + dec;
      }
    } else if (rawNum.includes('.')) {
      const parts = rawNum.split('.');
      const last = parts[parts.length - 1];
      if (last.length <= 2) {
        const whole = parseInt(parts.slice(0, -1).join(''), 10);
        const dec = parseInt(last.padEnd(2, '0'), 10);
        if (!Number.isNaN(whole) && !Number.isNaN(dec)) {
          cents = whole * 100 + dec;
        }
      } else {
        const whole = parseInt(parts.join(''), 10);
        if (!Number.isNaN(whole)) {
          cents = whole * 100;
        }
      }
    } else {
      const whole = parseInt(rawNum, 10);
      if (!Number.isNaN(whole)) {
        cents = whole * 100;
      }
    }

    if (cents !== null) {
      results.push({ raw: match[0], cents });
    }
  }

  return results;
}

/**
 * Collects all authoritative prices (in integer cents) from catalog items and executed tool results.
 * @param {Array<Record<string, any>>} catalogItems
 * @param {Array<Record<string, any>>} toolResults
 * @returns {Set<number>}
 */
function collectAllowedCents(catalogItems = [], toolResults = []) {
  const allowed = new Set();

  for (const item of catalogItems) {
    if (item && Number.isInteger(Number(item.price_cents))) {
      allowed.add(Number(item.price_cents));
    }
  }

  for (const tr of toolResults) {
    const res = tr?.result;
    if (!res || typeof res !== 'object') continue;
    const candidates = [
      res.price_cents,
      res.price_cents_snapshot,
      res.total_cents,
      res.appointment?.price_cents_snapshot,
      res.order?.total_cents,
      res.item?.price_cents,
    ];
    for (const c of candidates) {
      if (c !== undefined && c !== null && Number.isInteger(Number(c))) {
        allowed.add(Number(c));
      }
    }
    const items = res.items || res.order?.items || [];
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it?.price_cents !== undefined) allowed.add(Number(it.price_cents));
        if (it?.subtotal_cents !== undefined) allowed.add(Number(it.subtotal_cents));
      }
    }
  }

  return allowed;
}

/**
 * Detects whether text asserts a completed booking or order confirmation.
 * @param {string} text
 * @returns {{ claimed: boolean, kind: 'booking' | 'order' | 'generic' | null }}
 */
function detectConfirmationClaim(text) {
  const cleaned = String(text || '').replace(QUESTION_CLAUSE_RE, ' ');

  for (const re of BOOKING_CONFIRM_CLAIM_RES) {
    if (re.test(cleaned)) {
      return { claimed: true, kind: 'booking' };
    }
  }
  for (const re of ORDER_CONFIRM_CLAIM_RES) {
    if (re.test(cleaned)) {
      return { claimed: true, kind: 'order' };
    }
  }
  for (const re of GENERIC_CONFIRM_CLAIM_RES) {
    if (re.test(cleaned)) {
      return { claimed: true, kind: 'generic' };
    }
  }

  return { claimed: false, kind: null };
}

/**
 * Programmatically builds an immutable receipt block from a persisted SQLite record.
 * @param {{ type: 'appointment' | 'order', record: Record<string, any> }} commit
 * @returns {string}
 */
function formatDeterministicReceipt(commit) {
  if (!commit || !commit.record) return '';

  if (commit.type === 'appointment') {
    const a = commit.record;
    return [
      '[COMPROVANTE OFICIAL DE AGENDAMENTO]',
      `Código: ${a.id}`,
      `Cliente: ${a.client_name}`,
      `Serviço: ${a.item_name_snapshot}`,
      `Data/Hora: ${formatFriendly(a.date_str, a.time_slot)}`,
      `Duração: ${a.duration_minutes_snapshot} min`,
      `Valor: ${formatPriceCents(a.price_cents_snapshot)}`,
      `Status: ${a.status}`,
    ].join('\n');
  }

  if (commit.type === 'order') {
    const o = commit.record;
    const itemLines = (o.items || []).map(
      (it) =>
        `- ${it.qty}x ${it.name} (${formatPriceCents(it.price_cents)}) = ${formatPriceCents(it.subtotal_cents ?? it.price_cents * it.qty)}`
    );
    return [
      '[COMPROVANTE OFICIAL DE PEDIDO]',
      `Código: ${o.id}`,
      `Cliente: ${o.client_name}`,
      'Itens:',
      ...itemLines,
      `Total: ${formatPriceCents(o.total_cents)}`,
      `Status: ${o.status}`,
    ].join('\n');
  }

  return '';
}

/**
 * Elo 3 post-LLM guard (< 2ms):
 * 1. Blocks phantom booking/order confirmations without a persisted SQLite COMMIT.
 * 2. Intercepts hallucinated `R$` monetary values against authoritative SQLite prices.
 * 3. Appends an immutable deterministic receipt for every committed transaction.
 */
class AtomicOutputGuard {
  /**
   * @param {{
   *   phantomFallbackText?: string,
   *   priceFallbackText?: string
   * }} [options]
   */
  constructor(options = {}) {
    this.phantomFallbackText =
      options.phantomFallbackText ||
      'Ainda não concluí o registro no sistema. Para confirmar, por favor me confirme os dados finais para que eu finalize agora.';
    this.priceFallbackText =
      options.priceFallbackText ||
      'Não consegui validar o valor exato informado. Por favor, consulte novamente os valores oficiais do nosso catálogo.';
    this.wrongFlowFallbackText =
      options.wrongFlowFallbackText ||
      'Ops! Produtos seguem pelo fluxo de pedidos e serviços seguem pelo fluxo de agendamentos. Pode me confirmar qual item você deseja para eu seguir pelo caminho correto?';
    this.mixedFlowFallbackText =
      options.mixedFlowFallbackText ||
      'Para evitar qualquer erro, precisamos confirmar um por vez! Você prefere confirmar primeiro o agendamento do serviço ou o pedido do produto?';
  }

  /**
   * Validates LLM output text against authoritative catalog prices and turn commits.
   * @param {{
   *   text: string,
   *   catalogItems?: Array<Record<string, any>>,
   *   toolResults?: Array<Record<string, any>>,
   *   committedTransactions?: Array<{ type: 'appointment' | 'order', toolName: string, record: Record<string, any> }>
   * }} params
   */
  validate({
    text,
    catalogItems = [],
    toolResults = [],
    committedTransactions = [],
  }) {
    const startNs = process.hrtime.bigint();
    let rawText = String(text || '').trim();
    if (
      committedTransactions.length > 0 &&
      /(passando por uma r[aá]pida instabilidade|instabilidade na nossa intelig[eê]ncia)/i.test(
        rawText
      )
    ) {
      const hasOrder = committedTransactions.some((c) => c.type === 'order');
      const hasAppt = committedTransactions.some((c) => c.type === 'appointment');
      rawText =
        hasOrder && hasAppt
          ? 'Perfeito! Sua solicitação foi confirmada com sucesso.'
          : hasOrder
            ? 'Perfeito! Seu pedido foi confirmado com sucesso.'
            : 'Perfeito! Seu agendamento foi confirmado com sucesso.';
    }
    const receipts = committedTransactions
      .map((c) => formatDeterministicReceipt(c))
      .filter(Boolean);

    // 1. Cross-Flow & Mixed-Flow Lock (never book a PRODUCT, order a SERVICE, or mix both in 1 turn)
    const hasMixedFlowBlock = toolResults.some(
      (tr) => tr?.result?.code === 'MIXED_COMMIT_BLOCKED'
    );
    const hasBothCommitTypes =
      committedTransactions.some((c) => c.type === 'appointment') &&
      committedTransactions.some((c) => c.type === 'order');
    const claim = detectConfirmationClaim(rawText);

    if (
      hasBothCommitTypes ||
      (hasMixedFlowBlock && committedTransactions.length === 0 && claim.claimed)
    ) {
      const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      return {
        ok: false,
        blocked: true,
        reason: 'MIXED_FLOW_BLOCKED',
        claimKind: claim.kind,
        text: this.mixedFlowFallbackText,
        originalText: rawText,
        receipts: [],
        mismatches: [],
        allowedCents: [],
        latencyMs,
      };
    }

    const unresolvedWrongFlow = toolResults.find(
      (tr) =>
        (tr?.result?.code === 'WRONG_FLOW_USE_CREATE_ORDER' ||
          tr?.result?.code === 'WRONG_FLOW_USE_BOOK_SERVICE') &&
        committedTransactions.length === 0
    );
    const hasServices = catalogItems.some(
      (it) => String(it?.item_type || it?.type || '').toUpperCase() === 'SERVICE'
    );
    const hasProducts = catalogItems.some(
      (it) => String(it?.item_type || it?.type || '').toUpperCase() === 'PRODUCT'
    );

    if (
      (unresolvedWrongFlow && claim.claimed) ||
      (unresolvedWrongFlow?.result?.code === 'WRONG_FLOW_USE_CREATE_ORDER' &&
        /\b(agendad[oa]|hor[aá]rio\s+marcad[oa]|agenda\s+confirmada)\b/i.test(rawText)) ||
      (unresolvedWrongFlow?.result?.code === 'WRONG_FLOW_USE_BOOK_SERVICE' &&
        /\b(pedido\s+anotad[oa]|pedido\s+confirmad[oa]|compra\s+confirmada)\b/i.test(rawText)) ||
      (!hasServices && hasProducts && claim.claimed && claim.kind === 'booking') ||
      (hasServices && !hasProducts && claim.claimed && claim.kind === 'order')
    ) {
      const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      return {
        ok: false,
        blocked: true,
        reason: 'WRONG_FLOW_BLOCKED',
        claimKind: claim.kind,
        text: this.wrongFlowFallbackText,
        originalText: rawText,
        receipts: [],
        mismatches: [],
        allowedCents: [],
        latencyMs,
      };
    }

    // 2. Confirmation Lock (End of Phantom Confirmation Bug)
    if (claim.claimed) {
      const hasMatchingCommit =
        claim.kind === 'booking'
          ? committedTransactions.some((c) => c.type === 'appointment')
          : claim.kind === 'order'
            ? committedTransactions.some((c) => c.type === 'order')
            : committedTransactions.length > 0;

      if (!hasMatchingCommit) {
        const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
        return {
          ok: false,
          blocked: true,
          reason: 'PHANTOM_CONFIRMATION',
          claimKind: claim.kind,
          text: this.phantomFallbackText,
          originalText: rawText,
          receipts: [],
          latencyMs,
        };
      }
    }

    // 2. Price Lock (R$ extraction vs authoritative SQLite catalog/tool cents)
    const mentionedPrices = extractBrlMentions(rawText);
    const allowedCents = collectAllowedCents(catalogItems, toolResults);
    if (mentionedPrices.length > 0 && allowedCents.size > 0) {
      const mismatches = mentionedPrices.filter((m) => !allowedCents.has(m.cents));
      if (mismatches.length > 0) {
        const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
        return {
          ok: false,
          blocked: true,
          reason: 'PRICE_HALLUCINATION',
          mismatches,
          allowedCents: Array.from(allowedCents),
          text: this.priceFallbackText,
          originalText: rawText,
          receipts,
          latencyMs,
        };
      }
    }

    // 3. Deterministic Receipt Attachment
    let finalText = rawText;
    if (receipts.length > 0) {
      const receiptBlock = receipts.join('\n\n');
      finalText = finalText ? `${finalText}\n\n${receiptBlock}` : receiptBlock;
    }

    const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
    return {
      ok: true,
      blocked: false,
      reason: null,
      text: finalText,
      receipts,
      latencyMs,
    };
  }
}

AtomicOutputGuard.extractBrlMentions = extractBrlMentions;
AtomicOutputGuard.detectConfirmationClaim = detectConfirmationClaim;
AtomicOutputGuard.formatDeterministicReceipt = formatDeterministicReceipt;

module.exports = {
  AtomicOutputGuard,
  extractBrlMentions,
  detectConfirmationClaim,
  formatDeterministicReceipt,
};
~~~~

### core/ai/InputGuard.js

- **Bloco:** Bloco 3 — Camada 3 (Motor Agêntico, LlmRouter, Elo 3 & Voice)
- **Imports internos (`require` / `import`):** (nenhum)
- **Exports principais:** `InputGuard`, `INJECTION_PATTERNS`
- **Total de linhas:** 98

~~~~javascript
'use strict';

/**
 * InputGuard — Lightweight prompt-injection inspection and input sanitization
 * rescued cleanly from core/ring1/MaxOrchestrator.js.
 */

const INJECTION_PATTERNS = Object.freeze([
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|above|prior)/i,
  /you\s+are\s+now\s+(a|an|in)\s+/i,
  /forget\s+(everything|all|your)\s+(instructions?|rules?|prompt)/i,
  /system\s*:\s*/i,
  /\[system\]/i,
  /<\/?system>/i,
  /act\s+as\s+(if\s+you\s+are|a|an)\s+/i,
  /jailbreak/i,
  /do\s+not\s+follow\s+(your|the)\s+(original\s+)?(instructions?|rules?)/i,
  /new\s+instructions?\s*:/i,
  /override\s+(system|safety|rules?)/i,
]);

const DEFAULT_MAX_INPUT_LENGTH = 16000;

/**
 * Sanitizes incoming user messages and scores prompt-injection risk.
 */
class InputGuard {
  /**
   * @param {{ maxInputLength?: number, blockHighRisk?: boolean, patterns?: RegExp[] }} [options]
   */
  constructor(options = {}) {
    this.maxInputLength = Number.isInteger(options.maxInputLength)
      ? options.maxInputLength
      : DEFAULT_MAX_INPUT_LENGTH;
    this.blockHighRisk = options.blockHighRisk === true;
    this.patterns = Array.isArray(options.patterns)
      ? options.patterns
      : INJECTION_PATTERNS;
  }

  /**
   * Strips null bytes, normalizes line breaks, and caps input length.
   * @param {unknown} message
   * @returns {string}
   */
  sanitize(message) {
    let str = typeof message === 'string' ? message : String(message ?? '');
    str = str.replace(/\0/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (str.length > this.maxInputLength) {
      str = str.slice(0, this.maxInputLength) + '\n[...truncado por limite de segurança]';
    }
    return str.trim();
  }

  /**
   * Detects prompt-injection signatures in sanitized text.
   * @param {string} sanitizedMessage
   * @returns {{ level: 'none' | 'low' | 'medium' | 'high', matches: string[] }}
   */
  detectInjectionRisk(sanitizedMessage) {
    const matches = [];
    for (const pattern of this.patterns) {
      if (pattern.test(sanitizedMessage)) {
        matches.push(pattern.source);
      }
      pattern.lastIndex = 0;
    }

    let level = 'none';
    if (matches.length >= 3) level = 'high';
    else if (matches.length === 2) level = 'medium';
    else if (matches.length === 1) level = 'low';

    return { level, matches };
  }

  /**
   * Sanitizes and evaluates an incoming message.
   * @param {unknown} rawMessage
   * @param {{ blockHighRisk?: boolean }} [options]
   * @returns {{ sanitized: string, risk: { level: string, matches: string[] }, blocked: boolean }}
   */
  inspect(rawMessage, options = {}) {
    const sanitized = this.sanitize(rawMessage);
    const risk = this.detectInjectionRisk(sanitized);
    const shouldBlock =
      options.blockHighRisk !== undefined ? options.blockHighRisk : this.blockHighRisk;
    const blocked = Boolean(shouldBlock && risk.level === 'high');

    return { sanitized, risk, blocked };
  }
}

InputGuard.INJECTION_PATTERNS = INJECTION_PATTERNS;

module.exports = { InputGuard, INJECTION_PATTERNS };
~~~~
