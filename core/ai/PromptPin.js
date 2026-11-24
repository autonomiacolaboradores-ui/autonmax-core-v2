'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_PROMPTS_DIR = path.resolve(__dirname, '../prompts');
const DEFAULT_BASE_PROMPT_PATH = path.join(DEFAULT_PROMPTS_DIR, 'pme_base.v1.md');

/**
 * Legacy forbidden patterns consolidated from donor PromptPin + ci_prompt_guard.
 */
const FORBIDDEN_PATTERNS = Object.freeze([
  /Pix\s+At[oô]mico/i,
  /Finan[çc]as\/Pix/i,
  /concilia[çc][aã]o\s+de\s+pagamentos\s+Pix/i,
  /Log[ií]stica\s*\/\s*Entrega/i,
  /1[º°]\s+Assistente\s+Digital\s+Universal/i,
  /MaxCoin/i,
  /\bPENDING_PIX\b/,
  /gera(r)?\s+cobran[cç]a\s+Pix\s+da\s+plataforma/i,
  /sistema\s+de\s+cashback\s+Auton/i,
]);

/**
 * Normalizes line endings and computes canonical SHA-256 hex digest.
 * @param {string} text
 * @returns {string}
 */
function sha256(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim() + '\n';
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Scans prompt text against forbidden legacy regression patterns.
 * @param {string} text
 * @param {string} [label='prompt']
 * @returns {Array<{ label: string, pattern: string }>}
 */
function scanForbidden(text, label = 'prompt') {
  const hits = [];
  const source = String(text || '');
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(source)) {
      hits.push({ label, pattern: String(re) });
    }
    re.lastIndex = 0;
  }
  return hits;
}

/**
 * Reads and normalizes a canonical prompt markdown file.
 * @param {string} [promptPath]
 * @returns {string}
 */
function readCanonicalPrompt(promptPath = DEFAULT_BASE_PROMPT_PATH) {
  if (!fs.existsSync(promptPath)) {
    const err = new Error(`PROMPT_FILE_MISSING: ${promptPath}`);
    err.code = 'PROMPT_FILE_MISSING';
    throw err;
  }
  return fs.readFileSync(promptPath, 'utf8').replace(/\r\n/g, '\n').trim() + '\n';
}

/**
 * Validates any prompt string against forbidden patterns and optional expected SHA-256.
 * @param {string} text
 * @param {{ expectedSha256?: string, label?: string }} [options]
 */
function validatePromptText(text, options = {}) {
  const label = options.label || 'prompt';
  const forbidden = scanForbidden(text, label);
  const actualSha256 = sha256(text);
  const hashMismatch =
    options.expectedSha256 && options.expectedSha256 !== actualSha256
      ? [{ which: label, expected: options.expectedSha256, actual: actualSha256 }]
      : [];

  return {
    ok: forbidden.length === 0 && hashMismatch.length === 0,
    sha256: actualSha256,
    forbidden,
    hashMismatch,
  };
}

/**
 * Boot integrity gate for `pme_base.v1.md` (SHA-256 pin + ci_prompt_guard).
 */
class PromptPin {
  /**
   * @param {{ promptPath?: string, pinFilePath?: string, expectedSha256?: string }} [options]
   */
  constructor(options = {}) {
    this.promptPath = options.promptPath || DEFAULT_BASE_PROMPT_PATH;
    this.pinFilePath = options.pinFilePath || null;
    this.expectedSha256 = options.expectedSha256 || null;
    this._verifiedPrompt = null;
    this._verifiedSha256 = null;
  }

  /**
   * Verifies prompt existence, forbidden patterns, and SHA-256 hash integrity.
   * Throws an Error with `code` (`PROMPT_FORBIDDEN_PATTERN`, `PROMPT_HASH_MISMATCH`,
   * `PROMPT_FILE_MISSING`) when `strict !== false` and verification fails.
   * @param {{ strict?: boolean, expectedSha256?: string, pinFilePath?: string, createPinIfMissing?: boolean, extraTexts?: Array<{ label: string, text: string }> }} [options]
   */
  verifyAtBoot(options = {}) {
    const strict = options.strict !== false;
    const pinFilePath = options.pinFilePath ?? this.pinFilePath;
    let expectedSha256 = options.expectedSha256 ?? this.expectedSha256;

    const rawPrompt = readCanonicalPrompt(this.promptPath);
    const actualSha256 = sha256(rawPrompt);
    const forbidden = scanForbidden(rawPrompt, path.basename(this.promptPath));

    if (Array.isArray(options.extraTexts)) {
      for (const entry of options.extraTexts) {
        if (entry && entry.text) {
          forbidden.push(...scanForbidden(entry.text, entry.label || 'extra'));
        }
      }
    }

    let pinCreated = false;
    if (!expectedSha256 && pinFilePath) {
      if (fs.existsSync(pinFilePath)) {
        const stored = JSON.parse(fs.readFileSync(pinFilePath, 'utf8'));
        expectedSha256 = stored?.pme_base?.sha256 || stored?.sha256 || null;
      } else if (options.createPinIfMissing !== false) {
        fs.mkdirSync(path.dirname(pinFilePath), { recursive: true });
        fs.writeFileSync(
          pinFilePath,
          JSON.stringify(
            {
              version: 1,
              pme_base: {
                file: path.basename(this.promptPath),
                sha256: actualSha256,
                bytes: Buffer.byteLength(rawPrompt, 'utf8'),
              },
              computedAt: new Date().toISOString(),
            },
            null,
            2
          )
        );
        expectedSha256 = actualSha256;
        pinCreated = true;
      }
    }

    const hashMismatch =
      expectedSha256 && expectedSha256 !== actualSha256
        ? [{ which: 'pme_base', expected: expectedSha256, actual: actualSha256 }]
        : [];

    const ok = forbidden.length === 0 && hashMismatch.length === 0;
    const result = {
      ok,
      sha256: actualSha256,
      pinCreated,
      forbidden,
      hashMismatch,
      prompt: rawPrompt.trim(),
    };

    if (!ok && strict) {
      const code =
        forbidden.length > 0 ? 'PROMPT_FORBIDDEN_PATTERN' : 'PROMPT_HASH_MISMATCH';
      const err = new Error(
        forbidden.length > 0
          ? `PromptPin blocked forbidden legacy pattern(s): ${forbidden.map((f) => f.pattern).join(', ')}`
          : `PromptPin SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`
      );
      err.code = code;
      err.details = result;
      throw err;
    }

    if (ok) {
      this._verifiedPrompt = result.prompt;
      this._verifiedSha256 = actualSha256;
    }

    return result;
  }

  /**
   * Returns the verified base prompt (verifying on demand if not yet verified).
   * @returns {string}
   */
  getBasePrompt() {
    if (!this._verifiedPrompt) {
      const res = this.verifyAtBoot({ strict: true });
      return res.prompt;
    }
    return this._verifiedPrompt;
  }

  /**
   * Returns the verified SHA-256 hash.
   * @returns {string}
   */
  getSha256() {
    if (!this._verifiedSha256) {
      this.verifyAtBoot({ strict: true });
    }
    return this._verifiedSha256;
  }
}

PromptPin.FORBIDDEN_PATTERNS = FORBIDDEN_PATTERNS;
PromptPin.DEFAULT_BASE_PROMPT_PATH = DEFAULT_BASE_PROMPT_PATH;
PromptPin.sha256 = sha256;
PromptPin.scanForbidden = scanForbidden;
PromptPin.readCanonicalPrompt = readCanonicalPrompt;
PromptPin.validatePromptText = validatePromptText;

module.exports = {
  PromptPin,
  FORBIDDEN_PATTERNS,
  DEFAULT_BASE_PROMPT_PATH,
  sha256,
  scanForbidden,
  readCanonicalPrompt,
  validatePromptText,
};
