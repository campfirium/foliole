import type { DatabaseDriver } from './driver.js';

// A new row id identifies a newer dirty generation; old readers may only retire their own id.
export const DELETE_NODE_SEARCH_PENDING_SQL = `DELETE FROM search_index_invalidations
  WHERE target_id = ? AND invalidation_type != 'attachment_pdf'`;
export const INSERT_NODE_SEARCH_PENDING_SQL = `INSERT INTO search_index_invalidations (
  invalidation_type, target_id, status, attempts, created_at, updated_at
) VALUES ('node_workspace', ?, 'pending', 0, ?, ?)`;

export function normalizeSearchPendingStates(driver: DatabaseDriver) {
  return driver.transaction(() => {
    driver.execute("DELETE FROM search_index_invalidations WHERE status = 'completed'");
    driver.execute(`UPDATE search_index_invalidations SET status = 'pending', claimed_at = NULL,
      invalidation_type = 'node_workspace' WHERE invalidation_type != 'attachment_pdf'
      AND (status != 'pending' OR invalidation_type != 'node_workspace')`);
    driver.execute("UPDATE search_index_invalidations SET status = 'pending', claimed_at = NULL WHERE status != 'pending'");
    return driver.execute(`DELETE FROM search_index_invalidations WHERE id NOT IN (
      SELECT MAX(id) FROM search_index_invalidations GROUP BY invalidation_type, target_id
    )`).changes;
  });
}

export function retireSearchPendingThrough(driver: DatabaseDriver, lastCoveredId: number) {
  driver.execute('DELETE FROM search_index_invalidations WHERE id <= ?', [lastCoveredId]);
}
