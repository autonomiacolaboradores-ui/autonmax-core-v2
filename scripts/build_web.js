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
