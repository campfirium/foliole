import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';
import { SINGLE_PRINCIPAL_SYNC_GROUP_CLEANUP_STATEMENTS } from './singlePrincipalSyncGroupCleanupStatements.js';

export function migrateSinglePrincipalSyncGroup(sqlite: DatabaseMigrationTarget) {
  if (tableExists(sqlite, 'sync_peers')) sqlite.exec('DELETE FROM sync_peers');
  for (const statement of SINGLE_PRINCIPAL_SYNC_GROUP_CLEANUP_STATEMENTS) {
    if (statement.includes(' ON sync_object_state') && !tableExists(sqlite, 'sync_object_state')) continue;
    if (statement.includes(' ON review_log') && !tableExists(sqlite, 'review_log')) continue;
    sqlite.exec(statement);
  }
}
