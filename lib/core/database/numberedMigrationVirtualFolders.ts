import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { VIRTUAL_FOLDER_SCHEMA_STATEMENTS } from './virtualFolderSchemaStatements.js';

export function createVirtualFolderTables(sqlite: DatabaseMigrationTarget) {
  for (const statement of VIRTUAL_FOLDER_SCHEMA_STATEMENTS) {
    sqlite.exec(statement);
  }
}
