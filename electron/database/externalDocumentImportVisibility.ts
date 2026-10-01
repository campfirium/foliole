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
    .prepare(`SELECT locator AS source_locator, node_id AS latest_node_id, deleted_at,
      NULL AS source_ref, NULL AS source_location FROM stored_import_locators
      WHERE locator <> '' ORDER BY deleted_at IS NOT NULL ASC`)
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
  importedNodeIdsByLocator?: Map<string, string>
) {
  const locator = normalizeExternalImportLocator(absolutePath);
  if (importedNodeIdsByLocator) return importedNodeIdsByLocator.get(locator) ?? null;
  return openDatabaseConnection().driver.queryOne<{ node_id: string }>(
    `SELECT node_id FROM stored_import_locators WHERE locator = ?
      ORDER BY deleted_at IS NOT NULL ASC LIMIT 1`, [locator]
  )?.node_id ?? null;
}

export function isExternalDocumentVisible(absolutePath: string, activeImportedLocators?: Set<string>) {
  const locator = normalizeExternalImportLocator(absolutePath);
  if (activeImportedLocators) return !activeImportedLocators.has(locator);
  return !openDatabaseConnection().driver.queryOne(
    'SELECT node_id FROM stored_import_locators WHERE locator = ? LIMIT 1', [locator]
  );
}
