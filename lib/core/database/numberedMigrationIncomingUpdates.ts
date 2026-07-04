import type { DatabaseMigrationTarget } from './migrationTypes.js';

export function createIncomingUpdatesTable(sqlite: DatabaseMigrationTarget) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS incoming_updates (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_path TEXT NOT NULL,
    updated_content TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(topic_id, source_type, source_path, status)
  )`);
}
