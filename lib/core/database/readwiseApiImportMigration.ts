import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';

export const READWISE_API_IMPORT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS readwise_api_import_runs (
    connection_ref TEXT PRIMARY KEY,
    query_updated_after TEXT,
    round_started_at TEXT NOT NULL,
    reader_cursor TEXT,
    export_cursor TEXT,
    phase TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS readwise_api_import_stage (
    connection_ref TEXT NOT NULL,
    record_kind TEXT NOT NULL,
    remote_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (connection_ref, record_kind, remote_id)
  )`
] as const;

export function migrateReadwiseApiImport(sqlite: DatabaseMigrationTarget) {
  if (tableExists(sqlite, 'import_sources')) {
    addColumnIfMissing(sqlite, 'import_sources', 'remote_import_state_json', "TEXT NOT NULL DEFAULT '{}'");
  }
  for (const statement of READWISE_API_IMPORT_SCHEMA_STATEMENTS) sqlite.exec(statement);
}
