import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { SOURCE_OWNERSHIP_SCHEMA_STATEMENTS } from './sourceOwnershipSchemaStatements.js';

export function migrateSourceOwnershipSchema(sqlite: DatabaseMigrationTarget) {
  for (const statement of SOURCE_OWNERSHIP_SCHEMA_STATEMENTS) sqlite.exec(statement);
}
