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
