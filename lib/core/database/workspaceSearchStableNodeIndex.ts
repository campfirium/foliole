import type { DatabaseDriver } from './driver.js';
import { NodeBodyUnavailableError } from './nodeBodyResolution.js';
import { loadVerifiedBodyRefWithDriver, readBodyTextWithDriver } from './verifiedBodyWithDriver.js';
import { NODE_PATHS_CTE_SQL } from './workspaceSearchIndexSql.js';

interface SearchNodeRow extends Record<string, unknown> {
  node_id: string; title: string; path: string; body_hash: string | null; updated_at: string; is_trashed: number;
}

/** Store metadata only; the path computation remains one production CTE per indexing batch. */
export function prepareStableNodeSearchRows(driver: DatabaseDriver, affectedOnly: boolean) {
  driver.execute(`CREATE TEMP TABLE IF NOT EXISTS temp_workspace_search_node_rows (
    node_id TEXT PRIMARY KEY, title TEXT, path TEXT, body_hash TEXT, updated_at TEXT, is_trashed INTEGER) WITHOUT ROWID`);
  driver.execute('DELETE FROM temp_workspace_search_node_rows');
  driver.execute(`${NODE_PATHS_CTE_SQL} INSERT INTO temp_workspace_search_node_rows
    SELECT n.id, trim(n.title), COALESCE(paths.path, ''), NULLIF(TRIM(n.body_blob_hash), ''), n.updated_at,
      COALESCE(paths.is_trashed, n.deleted_at IS NOT NULL)
    FROM nodes n LEFT JOIN node_paths paths ON paths.node_id = n.id
    ${affectedOnly ? 'WHERE n.id IN (SELECT id FROM temp_workspace_search_affected_ids) AND paths.node_id IS NOT NULL' : ''}`);
  const missing = driver.queryAll<{ node_id: string }>(`SELECT rows.node_id FROM temp_workspace_search_node_rows rows
    LEFT JOIN content_bodies body ON body.hash = rows.body_hash AND body.verified = 1 WHERE body.hash IS NULL`);
  if (missing.length) throw new NodeBodyUnavailableError(missing.map((row) => row.node_id));
}

function insertSearchNode(driver: DatabaseDriver, row: SearchNodeRow) {
  const ref = row.body_hash ? loadVerifiedBodyRefWithDriver(driver, row.body_hash) : null;
  if (!ref) throw new NodeBodyUnavailableError([row.node_id]);
  const content = readBodyTextWithDriver(driver, ref);
  driver.execute(`INSERT INTO search.node_search (title, path, content, node_id, updated_at, is_trashed)
    VALUES (?, ?, ?, ?, ?, ?)`, [row.title, row.path, content, row.node_id, row.updated_at, row.is_trashed]);
}

/** The independent background index may materialize one article, never an array of article bodies. */
export function insertStableNodeSearchRows(driver: DatabaseDriver) {
  let after: string | null = null;
  for (;;) {
    const row: SearchNodeRow | undefined = driver.queryOne<SearchNodeRow>(`SELECT * FROM temp_workspace_search_node_rows
      WHERE (? IS NULL OR node_id > ?) ORDER BY node_id LIMIT 1`, [after, after]);
    if (!row) return;
    insertSearchNode(driver, row);
    after = row.node_id;
  }
}
