import type { DatabaseMigrationTarget } from './migrationTypes.js';

export const LEGACY_BODY_MIGRATION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS legacy_body_migration_progress (
    migration_id TEXT PRIMARY KEY,
    phase TEXT NOT NULL,
    cursor TEXT NOT NULL DEFAULT '',
    changed INTEGER NOT NULL DEFAULT 0,
    deleted_blobs INTEGER NOT NULL DEFAULT 0,
    deleted_bytes INTEGER NOT NULL DEFAULT 0,
    error TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS legacy_body_migration_protections (
    migration_id TEXT NOT NULL,
    object_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    PRIMARY KEY (migration_id, object_id)
  )`
];

export function initializeLegacyBodyMigrationSchema(sqlite: DatabaseMigrationTarget) {
  for (const statement of LEGACY_BODY_MIGRATION_SCHEMA) sqlite.exec(statement);
}
