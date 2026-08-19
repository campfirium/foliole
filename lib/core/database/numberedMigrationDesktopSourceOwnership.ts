import { DESKTOP_SOURCE_SCHEMA_STATEMENTS } from './desktopSourceSchemaStatements.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing, tableExists } from './numberedMigrationHelpers.js';

export function migrateDesktopSourceOwnership(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'desktop_sources')) {
    for (const statement of DESKTOP_SOURCE_SCHEMA_STATEMENTS) sqlite.exec(statement);
    return;
  }
  addColumnIfMissing(sqlite, 'desktop_sources', 'owner_installation_id', 'TEXT');
  if (tableExists(sqlite, 'external_search_folders')) {
    sqlite.exec(`UPDATE desktop_sources SET owner_installation_id = (
      SELECT folder.owner_installation_id FROM external_search_folders folder
      WHERE folder.source_ref = desktop_sources.source_ref
    ) WHERE source_type = 'external' AND EXISTS (
      SELECT 1 FROM external_search_folders folder
      WHERE folder.source_ref = desktop_sources.source_ref
        AND folder.owner_installation_id IS NOT NULL
    )`);
  }
  for (const statement of DESKTOP_SOURCE_SCHEMA_STATEMENTS.slice(1)) sqlite.exec(statement);
}
