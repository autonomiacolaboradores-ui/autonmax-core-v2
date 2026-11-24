'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_FILE_RE = /^(\d+)_(.+)\.js$/;

/**
 * Ensures the schema_migrations tracking table exists.
 * @param {import('node:sqlite').DatabaseSync} db
 */
function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Loads and validates all versioned migration scripts deterministically.
 * @param {string} [migrationsDir]
 * @returns {Array<{ version: number, name: string, up: Function }>}
 */
function loadMigrations(migrationsDir = __dirname) {
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const migrations = [];
  const seenVersions = new Set();

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = MIGRATION_FILE_RE.exec(entry.name);
    if (!match) continue;

    const fileVersion = Number(match[1]);
    const fullPath = path.join(migrationsDir, entry.name);
    const mod = require(fullPath);

    const version = Number.isInteger(mod.version) ? mod.version : fileVersion;
    const name = mod.name || `${match[1]}_${match[2]}`;

    if (!Number.isInteger(version) || version <= 0) {
      throw new Error(`Invalid migration version in ${entry.name}: ${version}`);
    }
    if (typeof mod.up !== 'function') {
      throw new Error(`Migration ${entry.name} must export an up(db) function`);
    }
    if (seenVersions.has(version)) {
      throw new Error(`Duplicate migration version detected: ${version}`);
    }

    seenVersions.add(version);
    migrations.push({ version, name, up: mod.up });
  }

  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}

/**
 * Returns the list of already-applied migration records ordered by version.
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Array<{ version: number, applied_at: string }>}
 */
function getAppliedMigrations(db) {
  ensureMigrationsTable(db);
  return db
    .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version ASC')
    .all()
    .map((row) => ({ ...row }));
}

/**
 * Runs all pending migrations atomically inside individual transactions.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ migrationsDir?: string }} [options]
 * @returns {{ applied: number[], skipped: number[], currentVersion: number }}
 */
function runMigrations(db, options = {}) {
  ensureMigrationsTable(db);

  const migrations = loadMigrations(options.migrationsDir || __dirname);
  const appliedSet = new Set(
    getAppliedMigrations(db).map((row) => Number(row.version))
  );

  const applied = [];
  const skipped = [];

  for (const migration of migrations) {
    if (appliedSet.has(migration.version)) {
      skipped.push(migration.version);
      continue;
    }

    db.exec('BEGIN IMMEDIATE;');
    try {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(
        migration.version
      );
      db.exec('COMMIT;');
      applied.push(migration.version);
      appliedSet.add(migration.version);
    } catch (err) {
      try {
        db.exec('ROLLBACK;');
      } catch {
        // Ignore rollback failure if SQLite already rolled back the statement.
      }
      throw new Error(
        `Migration v${migration.version} (${migration.name}) failed: ${err.message}`,
        { cause: err }
      );
    }
  }

  const currentVersion =
    appliedSet.size > 0 ? Math.max(...Array.from(appliedSet)) : 0;

  return { applied, skipped, currentVersion };
}

module.exports = {
  ensureMigrationsTable,
  loadMigrations,
  getAppliedMigrations,
  runMigrations,
};
