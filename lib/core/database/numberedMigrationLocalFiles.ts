import { LOCAL_FILE_SCHEMA_STATEMENTS } from './localFileSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

export function migrateLocalFilesRegistry(sqlite: DatabaseMigrationTarget) {
  for (const statement of LOCAL_FILE_SCHEMA_STATEMENTS) {
    sqlite.exec(statement);
  }
}
