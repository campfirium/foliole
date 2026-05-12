import { openDatabaseConnection } from './connection.js';

interface ActiveImportLocatorRow {
  source_locator: string;
}

export function loadActiveImportedSourceLocators() {
  const rows = openDatabaseConnection().sqlite
    .prepare(
      `SELECT source.source_locator
       FROM import_sources source
       JOIN nodes node ON node.id = source.latest_node_id
       WHERE source.source_locator <> ''
         AND node.deleted_at IS NULL`
    )
    .all() as ActiveImportLocatorRow[];
  return new Set(rows.map((row) => row.source_locator));
}

export function isExternalDocumentVisible(absolutePath: string, activeImportedLocators = loadActiveImportedSourceLocators()) {
  return !activeImportedLocators.has(absolutePath);
}
