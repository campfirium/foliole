import type { DatabaseMigrationTarget } from './migrationTypes.js';

export const READWISE_API_RECONCILE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS readwise_api_reconcile_runs (
    connection_ref TEXT PRIMARY KEY,
    scope_json TEXT NOT NULL,
    started_at TEXT NOT NULL,
    reader_cursor TEXT,
    export_cursor TEXT,
    phase TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS readwise_api_reconcile_stage (
    connection_ref TEXT NOT NULL,
    record_kind TEXT NOT NULL,
    remote_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (connection_ref, record_kind, remote_id)
  )`
] as const;

export function migrateReadwiseApiReconcile(sqlite: DatabaseMigrationTarget) {
  for (const statement of READWISE_API_RECONCILE_SCHEMA_STATEMENTS) sqlite.exec(statement);
}
