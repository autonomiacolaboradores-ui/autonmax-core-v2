'use strict';

/**
 * WorkspaceHygiene — rotação automática de artefatos (install-and-forget)
 * - replay / metrics / booking_audit antigos
 * - não mexe em sessions Baileys nem attendants_db
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROOT = path.join(__dirname, '../../workspace');
const DEFAULT_MAX_AGE_DAYS = 14;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function isOlderThan(filePath, maxAgeMs) {
  try {
    const st = fs.statSync(filePath);
    return Date.now() - st.mtimeMs > maxAgeMs;
  } catch (_) {
    return false;
  }
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, out);
    else if (e.isFile()) out.push(full);
  }
  return out;
}

class WorkspaceHygiene {
  constructor(options = {}) {
    this.root = options.root || DEFAULT_ROOT;
    this.maxAgeDays = Number(options.maxAgeDays) > 0 ? Number(options.maxAgeDays) : DEFAULT_MAX_AGE_DAYS;
    this.intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : DEFAULT_INTERVAL_MS;
    this._timer = null;
  }

  /**
   * Remove arquivos velhos em pastas de log/replay (não apaga agenda nem sessão WA).
   */
  runOnce() {
    const maxAgeMs = this.maxAgeDays * 24 * 60 * 60 * 1000;
    const targets = [
      path.join(this.root, 'runtime_excellence', 'replay'),
      path.join(this.root, 'runtime_excellence', 'traces'),
      path.join(this.root, 'metrics'),
      path.join(this.root, 'booking_audit'),
      path.join(this.root, 'reports', 'daily')
    ];
    let removed = 0;
    let bytes = 0;
    for (const dir of targets) {
      for (const file of walkFiles(dir)) {
        const base = path.basename(file);
        // preservar readiness e configs
        if (base === 'tools_readiness.json' || base.endsWith('.gitkeep')) continue;
        if (!isOlderThan(file, maxAgeMs)) continue;
        try {
          const st = fs.statSync(file);
          fs.unlinkSync(file);
          removed += 1;
          bytes += st.size || 0;
        } catch (_) {}
      }
    }
    if (removed > 0) {
      console.log(
        `[HYGIENE] Removidos ${removed} arquivo(s) com >${this.maxAgeDays}d (~${Math.round(bytes / 1024)} KB)`
      );
    }
    return { removed, bytes, maxAgeDays: this.maxAgeDays };
  }

  start() {
    if (this._timer) return;
    try {
      this.runOnce();
    } catch (e) {
      console.warn('[HYGIENE] runOnce:', e.message);
    }
    this._timer = setInterval(() => {
      try {
        this.runOnce();
      } catch (e) {
        console.warn('[HYGIENE]', e.message);
      }
    }, this.intervalMs);
    if (this._timer.unref) this._timer.unref();
    console.log(`[HYGIENE] Agendado a cada ${Math.round(this.intervalMs / 3600000)}h (maxAge=${this.maxAgeDays}d)`);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

let _singleton = null;
function getWorkspaceHygiene(options) {
  if (!_singleton) _singleton = new WorkspaceHygiene(options);
  return _singleton;
}

module.exports = {
  WorkspaceHygiene,
  getWorkspaceHygiene
};
