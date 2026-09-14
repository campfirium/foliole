import { DATA_MIGRATION_STATE_SCHEMA_STATEMENTS } from './dataMigrationState.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

export function createDataMigrationStateTable(sqlite: DatabaseMigrationTarget) {
  for (const statement of DATA_MIGRATION_STATE_SCHEMA_STATEMENTS) {
    sqlite.exec(statement);
  }
}
