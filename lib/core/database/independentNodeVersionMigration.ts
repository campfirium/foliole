import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';

// Copy dependent facts before DROP, which performs ON DELETE CASCADE even inside a migration.
const STATEMENTS = [
  `CREATE TEMP TABLE s278_version_edges AS SELECT * FROM node_sync_version_parents`,
  `CREATE TEMP TABLE s278_version_origins AS SELECT * FROM node_version_local_origins`,
  `CREATE TABLE s278_versions (
    version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL, parent_version_id TEXT,
    host_name TEXT NOT NULL, created_at TEXT NOT NULL, content_hash TEXT NOT NULL,
    body_text TEXT, snapshot_json TEXT)`,
  `INSERT INTO s278_versions SELECT version_id, object_id, parent_version_id, host_name,
    created_at, content_hash, body_text, snapshot_json FROM node_sync_versions`,
  'DROP TABLE node_sync_versions',
  'ALTER TABLE s278_versions RENAME TO node_sync_versions',
  'INSERT OR IGNORE INTO node_sync_version_parents SELECT * FROM s278_version_edges',
  'INSERT OR IGNORE INTO node_version_local_origins SELECT * FROM s278_version_origins',
  'DROP TABLE s278_version_edges',
  'DROP TABLE s278_version_origins',
  `CREATE TABLE s278_conflicts (
    conflict_version_id TEXT PRIMARY KEY, object_id TEXT NOT NULL, parent_version_id TEXT,
    host_name TEXT, content_hash TEXT, snapshot_json TEXT NOT NULL, detected_at TEXT NOT NULL)`,
  'INSERT INTO s278_conflicts SELECT * FROM node_sync_conflicts',
  'DROP TABLE node_sync_conflicts',
  'ALTER TABLE s278_conflicts RENAME TO node_sync_conflicts',
  'CREATE INDEX idx_node_sync_conflicts_object_detected ON node_sync_conflicts (object_id, detected_at)',
  `CREATE INDEX idx_node_sync_versions_object_created ON node_sync_versions (object_id, created_at)`
] as const;

export function migrateIndependentNodeVersions(sqlite: DatabaseMigrationTarget) {
  for (const statement of STATEMENTS) sqlite.exec(statement);
  if (sqlite.prepare('PRAGMA foreign_key_check').all().length) {
    throw new Error('independent_node_versions_foreign_key_violation');
  }
}

export async function migrateCompanionIndependentNodeVersions(db: DbPort) {
  for (const statement of STATEMENTS) await db.run(statement);
  if ((await db.query('PRAGMA foreign_key_check')).length) {
    throw new Error('independent_node_versions_foreign_key_violation');
  }
}
