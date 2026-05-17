import { openDatabaseConnection } from './connection.js';

interface ActiveImportLocatorRow {
  deleted_at: string | null;
  latest_node_id: string;
  source_locator: string;
}

export function normalizeExternalImportLocator(locator: string) {
  return locator.replace(/\\/g, '/').toLowerCase();
}

export function loadActiveImportedSourceLocators() {
  return new Set(loadActiveImportedSourceLocatorRows().map((row) => normalizeExternalImportLocator(row.source_locator)));
}

export function loadActiveImportedSourceLocatorRows() {
  const rows = openDatabaseConnection().sqlite
    .prepare(
      `SELECT source.source_locator, source.latest_node_id, node.deleted_at
       FROM import_sources source
       JOIN nodes node ON node.id = source.latest_node_id
       WHERE source.source_locator <> ''
       ORDER BY node.deleted_at IS NOT NULL ASC, source.last_imported_at DESC`
    )
    .all() as ActiveImportLocatorRow[];
  return rows;
}

export function loadActiveImportedSourceLocatorNodeIds() {
  const nodeIds = new Map<string, string>();
  loadActiveImportedSourceLocatorRows().forEach((row) => {
    const locator = normalizeExternalImportLocator(row.source_locator);
    if (!nodeIds.has(locator)) {
      nodeIds.set(locator, row.latest_node_id);
    }
  });
  return nodeIds;
}

export function resolveImportedNodeIdForExternalDocument(
  absolutePath: string,
  importedNodeIdsByLocator = loadActiveImportedSourceLocatorNodeIds()
) {
  return importedNodeIdsByLocator.get(normalizeExternalImportLocator(absolutePath)) ?? null;
}

export function isExternalDocumentVisible(absolutePath: string, activeImportedLocators = loadActiveImportedSourceLocators()) {
  return !activeImportedLocators.has(normalizeExternalImportLocator(absolutePath));
}
