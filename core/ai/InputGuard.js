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
