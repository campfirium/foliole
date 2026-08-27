import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { SINGLE_PRINCIPAL_SYNC_GROUP_CLEANUP_STATEMENTS } from './singlePrincipalSyncGroupCleanupStatements.js';

export function migrateSinglePrincipalSyncGroup(sqlite: DatabaseMigrationTarget) {
  sqlite.exec('DELETE FROM sync_peers');
  for (const statement of SINGLE_PRINCIPAL_SYNC_GROUP_CLEANUP_STATEMENTS) sqlite.exec(statement);
}
