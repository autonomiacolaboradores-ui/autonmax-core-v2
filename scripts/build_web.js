'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
  const filesCopied = copyRecursive(appWebDir, distDir, distDir);

  const indexPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Build verification failed: missing ${indexPath}`);
  }

  return {
    ok: true,
    distDir,
    filesCopied,
  };
}

if (require.main === module) {
  const res = buildWeb();
  console.log(`[build:web] Built ${res.filesCopied} files into ${res.distDir}`);
}

module.exports = { buildWeb };
