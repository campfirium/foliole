import { WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS } from './desktopSourceConnectionSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing, execOptionalIndex } from './numberedMigrationHelpers.js';

export function migrateDesktopSourceConnections(sqlite: DatabaseMigrationTarget) {
  addColumnIfMissing(sqlite, 'import_sources', 'watched_binding_id', 'TEXT');
  addColumnIfMissing(sqlite, 'import_sources', 'watched_relative_path', 'TEXT');
  execOptionalIndex(sqlite, `CREATE INDEX IF NOT EXISTS idx_import_sources_watched_relative
    ON import_sources (watched_binding_id, watched_relative_path)`);
  for (const statement of WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS) sqlite.exec(statement);
}
