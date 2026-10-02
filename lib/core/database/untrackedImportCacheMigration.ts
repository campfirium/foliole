import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';

export function removeUntrackedImportCaches(sqlite: DatabaseMigrationTarget) {
  if (!tableExists(sqlite, 'keep_import_item_cache')) return;
  sqlite.exec(`DELETE FROM keep_import_item_cache
    WHERE NOT EXISTS (
      SELECT 1 FROM keep_import_items item
      WHERE item.rule_id = keep_import_item_cache.rule_id COLLATE BINARY
        AND item.source_path = keep_import_item_cache.source_path COLLATE BINARY
    )`);
}
