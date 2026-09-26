import type { DatabaseMigrationTarget } from './migrationTypes.js';

export const WATCHED_FOLDER_CONFLICT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS watched_folder_conflict_decisions (
    group_id TEXT NOT NULL,
    conflict_key TEXT NOT NULL,
    decision_id TEXT NOT NULL,
    decided_at TEXT NOT NULL,
    decided_by_device_identity_key TEXT NOT NULL,
    selected_binding_ids_json TEXT NOT NULL,
    PRIMARY KEY (group_id, conflict_key)
  )`
];

export function createWatchedFolderConflictDecisions(sqlite: DatabaseMigrationTarget) {
  for (const statement of WATCHED_FOLDER_CONFLICT_SCHEMA_STATEMENTS) sqlite.exec(statement);
}
