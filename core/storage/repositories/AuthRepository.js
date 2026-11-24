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
