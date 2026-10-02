import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { tableExists } from './numberedMigrationHelpers.js';

export const LEGACY_STORAGE_RETIREMENT_SQL = [
  'DROP TABLE IF EXISTS virtual_folder_items',
  'DROP TABLE IF EXISTS virtual_folders',
  'DROP TABLE IF EXISTS node_order'
] as const;

/** Keep historical table creation available only to migrations predating the cutover. */
export function isLegacyOrderingSchema(statement: string) {
  return /CREATE TABLE IF NOT EXISTS node_order\b/.test(statement);
}

export function retireLegacyStorage(sqlite: DatabaseMigrationTarget) {
  for (const statement of LEGACY_STORAGE_RETIREMENT_SQL) sqlite.exec(statement);
  if (!tableExists(sqlite, 'keep_import_item_cache')) return;
  const rows = sqlite.prepare(`SELECT rule_id, source_path, title, content FROM keep_import_item_cache
    WHERE content IS NOT NULL AND content_preview = content AND length(content_preview) > 201`).all() as
    { rule_id: string; source_path: string; title: string; content: string }[];
  const update = sqlite.prepare(`UPDATE keep_import_item_cache SET content_preview = ?
    WHERE rule_id = ? AND source_path = ?`);
  for (const row of rows) {
    update.run(resolveNodeOpeningText(row.content, row.title), row.rule_id, row.source_path);
  }
  // Existing stored-source search triggers refresh each affected entry in the same transaction.
}

export async function retireCompanionLegacyStorage(db: DbPort) {
  for (const statement of LEGACY_STORAGE_RETIREMENT_SQL) await db.run(statement);
}
