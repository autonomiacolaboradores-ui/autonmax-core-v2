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
    working_hours: DatabaseManager.parseJson(plain.working_hours_json, null),
    policies: DatabaseManager.parseJson(plain.policies_json, null),
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
    const workingHoursJson = DatabaseManager.stringifyJson(
      data.workingHours ?? data.working_hours ?? data.working_hours_json,
      null
    );
    const policiesJson = DatabaseManager.stringifyJson(
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
    const featureFlagsJson = DatabaseManager.stringifyJson(
      data.featureFlags ?? data.feature_flags ?? data.feature_flags_json ?? DEFAULT_FEATURE_FLAGS,
      JSON.stringify(DEFAULT_FEATURE_FLAGS)
    );

    this._db()
      .prepare(
        `INSERT INTO partners (
          id, email, password_hash, display_name, store_segment, is_active,
          personality_prompt, business_rules, working_hours_json, policies_json,
          welcome_message, pdf_files_json, image_files_json, owner_jid, feature_flags_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      workingHours: (v) => ['working_hours_json', DatabaseManager.stringifyJson(v, null)],
      working_hours_json: (v) => ['working_hours_json', DatabaseManager.stringifyJson(v, null)],
      policies: (v) => ['policies_json', DatabaseManager.stringifyJson(v, null)],
      policies_json: (v) => ['policies_json', DatabaseManager.stringifyJson(v, null)],
      welcomeMessage: (v) => ['welcome_message', v],
      welcome_message: (v) => ['welcome_message', v],
      pdfFiles: (v) => ['pdf_files_json', DatabaseManager.stringifyJson(v, '[]')],
      pdf_files_json: (v) => ['pdf_files_json', DatabaseManager.stringifyJson(v, '[]')],
      imageFiles: (v) => ['image_files_json', DatabaseManager.stringifyJson(v, '[]')],
      image_files_json: (v) => ['image_files_json', DatabaseManager.stringifyJson(v, '[]')],
      ownerJid: (v) => ['owner_jid', v],
      owner_jid: (v) => ['owner_jid', v],
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
