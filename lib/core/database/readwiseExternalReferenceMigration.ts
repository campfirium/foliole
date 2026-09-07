import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';

export function migrateReadwiseExternalReferences(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'external_documents')) return;
  addColumnIfMissing(sqlite, 'external_documents', 'reference_kind', "TEXT NOT NULL DEFAULT 'local_path'");
  addColumnIfMissing(sqlite, 'external_documents', 'reference_json', 'TEXT');
}
