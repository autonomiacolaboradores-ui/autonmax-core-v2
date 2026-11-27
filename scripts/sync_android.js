'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildWeb } = require('./build_web');

const VNEXT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ANDROID_PUBLIC_DIR = path.join(
  VNEXT_ROOT,
  'android',
  'app',
  'src',
  'main',
  'assets',
  'public'
);

function copyDirRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copied += copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
      copied += 1;
    }
  }
  return copied;
}

/**
 * Builds `app-web/dist` and syncs static web assets into
 * `android/app/src/main/assets/public` without requiring `@capacitor/cli`.
 * @param {{ apiBaseUrl?: string, destDir?: string }} [options]
 */
function syncAndroidAssets(options = {}) {
  const webRes = buildWeb({ apiBaseUrl: options.apiBaseUrl });
  const destDir = path.resolve(options.destDir || DEFAULT_ANDROID_PUBLIC_DIR);

  fs.rmSync(destDir, { recursive: true, force: true });
  const filesSynced = copyDirRecursive(webRes.distDir, destDir);

  return {
    ok: true,
    distDir: webRes.distDir,
    destDir,
    filesSynced,
    buildId: webRes.buildId,
  };
}

if (require.main === module) {
  const res = syncAndroidAssets();
  console.log(
    `[sync:android] Synced ${res.filesSynced} web files -> ${res.destDir} (buildId=${res.buildId})`
  );
}

module.exports = { syncAndroidAssets, DEFAULT_ANDROID_PUBLIC_DIR };
