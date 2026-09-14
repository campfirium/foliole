import type { DatabaseMigrationTarget } from './migrationTypes.js';

export const DATA_MIGRATION_STATE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS data_migration_state (
    migration_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed')),
    updated_at TEXT NOT NULL
  )`
];

export interface DataMigrationState {
  migration_id: string;
  run_id: string;
  status: 'completed' | 'running';
  updated_at: string;
}

export function readDataMigrationState(
  sqlite: DatabaseMigrationTarget,
  migrationId: string
): DataMigrationState | null {
  const rows = sqlite.prepare(
    `SELECT migration_id, run_id, status, updated_at
     FROM data_migration_state WHERE migration_id = ?`
  ).all(migrationId) as DataMigrationState[];
  return rows[0] ?? null;
}

export function writeDataMigrationState(
  sqlite: DatabaseMigrationTarget,
  state: DataMigrationState
) {
  sqlite.prepare(
    `INSERT INTO data_migration_state (migration_id, run_id, status, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(migration_id) DO UPDATE SET
       run_id = excluded.run_id,
       status = excluded.status,
       updated_at = excluded.updated_at`
  ).run(state.migration_id, state.run_id, state.status, state.updated_at);
}
