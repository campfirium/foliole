import type { DatabaseDriver } from './driver.js';

/** Neighbor lookup for PDF boundary matches, derived only during index maintenance. */
export function refreshWorkspacePdfPageMap(driver: DatabaseDriver) {
  driver.execute('DELETE FROM search.pdf_page_map');
  driver.execute(`INSERT INTO search.pdf_page_map (row_id, node_id, attachment_id, page)
    SELECT rowid, node_id, attachment_id, CAST(page AS INTEGER) FROM search.pdf_search`);
}
