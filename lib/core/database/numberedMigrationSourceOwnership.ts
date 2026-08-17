import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing } from './numberedMigrationHelpers.js';
import { SOURCE_OWNERSHIP_SCHEMA_STATEMENTS } from './sourceOwnershipSchemaStatements.js';

export function migrateSourceOwnershipSchema(sqlite: DatabaseMigrationTarget) {
  addColumnIfMissing(sqlite, 'sync_group_members', 'advertised_features_json', 'TEXT');
  for (const statement of SOURCE_OWNERSHIP_SCHEMA_STATEMENTS) sqlite.exec(statement);
}
