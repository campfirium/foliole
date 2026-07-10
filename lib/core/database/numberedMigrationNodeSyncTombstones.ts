import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { NODE_SYNC_TOMBSTONE_SCHEMA_STATEMENTS } from './nodeSyncTombstoneSchemaStatements.js';

export function createNodeSyncTombstoneTable(sqlite: DatabaseMigrationTarget) {
  for (const statement of NODE_SYNC_TOMBSTONE_SCHEMA_STATEMENTS) {
    sqlite.exec(statement);
  }
}
