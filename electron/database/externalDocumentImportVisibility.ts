import { openDatabaseConnection } from './connection.js';
import { resolveDesktopSourceAddress } from './desktopSources.js';

interface ActiveImportLocatorRow {
  deleted_at: string | null;
  latest_node_id: string;
  source_location: string | null;
  source_locator: string;
  source_ref: string | null;
}

function normalizeExternalImportLocator(locator: string) {
  return locator.replace(/\\/g, '/').toLowerCase();
}

function currentLocator(row: ActiveImportLocatorRow) {
  return row.source_ref && row.source_location
    ? resolveDesktopSourceAddress(row.source_ref, row.source_location)
    : row.source_locator;
}

export function loadActiveImportedSourceLocators() {
  return new Set(loadActiveImportedSourceLocatorRows()
    .map(currentLocator).filter((value): value is string => Boolean(value)).map(normalizeExternalImportLocator));
}

function loadActiveImportedSourceLocatorRows() {
  const rows = openDatabaseConnection().sqlite
    .prepare(
      `SELECT source.source_locator, source.source_ref, source.source_location,
         source.latest_node_id, node.deleted_at
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
    const current = currentLocator(row);
    if (!current) return;
    const locator = normalizeExternalImportLocator(current);
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
