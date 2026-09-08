'use strict';

/**
 * PromptPin — OPS-3
 * Canonical system prompts with SHA-256 pin at boot.
 * Regressão de personalidade (Pix/logística de plataforma) = CRITICAL.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROMPTS_DIR = path.join(__dirname, '../prompts');

const FORBIDDEN_PATTERNS = [
  // Positive product claims / legacy brand (not "evitar" instructional text)
  /Pix\s+At[oô]mico/i,
  /MaxCoin/i,
  /\bPENDING_PIX\b/,
  /gera(r)?\s+cobran[cç]a\s+Pix\s+da\s+plataforma/i,
  /sistema\s+de\s+cashback\s+Auton/i
];

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function readCanonical(name) {
  const full = path.join(PROMPTS_DIR, name);
  if (!fs.existsSync(full)) {
    const err = new Error(`PROMPT_FILE_MISSING:${name}`);
    err.code = 'PROMPT_FILE_MISSING';
    throw err;
  }
  return fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n').trim() + '\n';
}

/**
 * Expected hashes are computed from the files on disk at first pin generation,
 * then stored in workspace/prompt_pin.json so CI and boot share the same pin.
 */
function pinPath(workspaceRoot) {
  return path.join(workspaceRoot || path.join(__dirname, '../../workspace'), 'prompt_pin.json');
}

function computePins() {
  const pme = readCanonical('pme_base.v1.md');
  return {
    version: 1,
    pme_base: {
      file: 'pme_base.v1.md',
      sha256: sha256(pme),
      bytes: Buffer.byteLength(pme)
    },
    computedAt: new Date().toISOString()
  };
}

function loadOrCreatePin(workspaceRoot) {
  const p = pinPath(workspaceRoot);
  const current = computePins();
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(current, null, 2));
    return { pin: current, created: true };
  }
  const stored = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { pin: stored, created: false, current };
}

function scanForbidden(text, label) {
  const hits = [];
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(text)) hits.push({ label, pattern: String(re) });
  }
  return hits;
}

/**
 * Boot gate: verify files match pin (or create pin on first boot) and no forbidden content.
 * @returns {{ ok: boolean, critical: boolean, details: object }}
 */
function verifyAtBoot(options = {}) {
  const workspaceRoot = options.workspaceRoot || path.join(__dirname, '../../workspace');
  const strict = options.strict !== false;
  const details = { forbidden: [], hashMismatch: [], pins: null };

  try {
    const pme = readCanonical('pme_base.v1.md');
    details.forbidden.push(...scanForbidden(pme, 'pme_base.v1.md'));

    // Also scan runtime SystemPrompt module exports
    try {
      const sp = require('../ring1/SystemPrompt');
      details.forbidden.push(...scanForbidden(sp.PARTNER_UNIVERSAL_EMPLOYEE_PROMPT || '', 'SystemPrompt.partner'));
    } catch (_) {}

    const { pin, created, current } = loadOrCreatePin(workspaceRoot);
    details.pins = pin;
    details.pinCreated = !!created;

    if (!created && current) {
      if (current.pme_base.sha256 !== pin.pme_base.sha256) {
        details.hashMismatch.push({
          which: 'pme_base',
          expected: pin.pme_base.sha256,
          actual: current.pme_base.sha256
        });
      }
    }

    const critical = details.forbidden.length > 0 || details.hashMismatch.length > 0;
    if (critical) {
      console.error('[PROMPT_PIN] CRITICAL', JSON.stringify(details, null, 2));
    } else {
      console.log(
        `[PROMPT_PIN] OK pme=${pin.pme_base.sha256.slice(0, 12)}… created=${!!created}`
      );
    }

    if (critical && strict && options.exitOnCritical) {
      process.exitCode = 2;
    }

    return {
      ok: !critical,
      critical,
      details,
      getPmeBasePrompt: () => pme.trim()
    };
  } catch (err) {
    console.error('[PROMPT_PIN] BOOT_FAIL', err.message);
    return { ok: false, critical: true, details: { error: err.message } };
  }
}

function getPinnedPmeBase() {
  return readCanonical('pme_base.v1.md').trim();
}

module.exports = {
  FORBIDDEN_PATTERNS,
  sha256,
  computePins,
  loadOrCreatePin,
  verifyAtBoot,
  getPinnedPmeBase,
  scanForbidden,
  PROMPTS_DIR
};
