import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS } from './searchIndexInvalidationSchemaStatements.js';

function tableExists(sqlite: DatabaseMigrationTarget, tableName: string) {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(tableName)[0] as { name?: string } | undefined;
  return row?.name === tableName;
}

export function migrateSearchIndexInvalidationTypes(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'search_index_invalidations')) {
    SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS.forEach((statement) => sqlite.exec(statement));
    return;
  }
  sqlite.exec('DROP INDEX IF EXISTS idx_search_index_invalidations_pending');
  sqlite.exec('DROP INDEX IF EXISTS idx_search_index_invalidations_claim');
  sqlite.exec('ALTER TABLE search_index_invalidations RENAME TO search_index_invalidations_v40');
  SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS.forEach((statement) => sqlite.exec(statement));
  sqlite.exec(`INSERT INTO search_index_invalidations (
      id, invalidation_type, target_id, status, attempts, last_error, created_at, updated_at, claimed_at, completed_at
    )
    SELECT id, invalidation_type, target_id, status, attempts, last_error, created_at, updated_at, claimed_at, completed_at
    FROM search_index_invalidations_v40`);
  sqlite.exec('DROP TABLE search_index_invalidations_v40');
}
