import type { DatabaseBindParams, DatabaseDriver } from './driver.js';

/** Neighbor lookup for PDF boundary matches, derived only during index maintenance. */
export function refreshWorkspacePdfPageMap(driver: DatabaseDriver) {
  driver.execute('DELETE FROM search.pdf_page_map');
  driver.execute(`INSERT INTO search.pdf_page_map (row_id, node_id, attachment_id, page)
    SELECT rowid, node_id, attachment_id, CAST(page AS INTEGER) FROM search.pdf_search`);
}

/** The caller supplies the same internal node selection used for FTS maintenance. */
export function deleteWorkspacePdfPageMapForNodes(driver: DatabaseDriver, nodeIdsSql: string, params?: DatabaseBindParams) {
  driver.execute(`DELETE FROM search.pdf_page_map WHERE node_id IN (${nodeIdsSql})`, params);
}

export function refreshWorkspacePdfPageMapForNodes(driver: DatabaseDriver, nodeIdsSql: string) {
  deleteWorkspacePdfPageMapForNodes(driver, nodeIdsSql);
  driver.execute(`INSERT INTO search.pdf_page_map (row_id, node_id, attachment_id, page)
    SELECT rowid, node_id, attachment_id, CAST(page AS INTEGER) FROM search.pdf_search
    WHERE node_id IN (${nodeIdsSql})`);
}
