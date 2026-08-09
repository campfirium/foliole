import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { SYNC_GROUP_SCHEMA_STATEMENTS } from './syncGroupSchemaStatements.js';

export function migrateSyncGroupDepartures(sqlite: DatabaseMigrationTarget) {
  for (const statement of SYNC_GROUP_SCHEMA_STATEMENTS) sqlite.exec(statement);
}
