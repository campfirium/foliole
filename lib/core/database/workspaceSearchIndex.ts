import type { DatabaseDriver } from './driver.js';
import { NodeBodyUnavailableError } from './nodeBodyResolution.js';
import { NODE_PDF_RESOURCES_SQL } from './nodePdfResourcesSql.js';
import { refreshWorkspacePdfPageMap } from './workspacePdfPageMap.js';
import { NODE_PATHS_CTE_SQL, NODE_SEARCH_INSERT_AFFECTED_SQL, NODE_SEARCH_REBUILD_SQL, PDF_SEARCH_INSERT_AFFECTED_SQL, PDF_SEARCH_REBUILD_SQL } from './workspaceSearchIndexSql.js';
import { insertStableNodeSearchRows, prepareStableNodeSearchRows } from './workspaceSearchStableNodeIndex.js';

type SearchBodyStorage = 'continuous' | 'chunked';

const TEMP_SEED_IDS_SQL = `CREATE TEMP TABLE IF NOT EXISTS temp_workspace_search_seed_ids (
  id TEXT PRIMARY KEY
) WITHOUT ROWID`;

const TEMP_AFFECTED_IDS_SQL = `CREATE TEMP TABLE IF NOT EXISTS temp_workspace_search_affected_ids (
  id TEXT PRIMARY KEY
) WITHOUT ROWID`;

const INSERT_AFFECTED_DESCENDANT_IDS_SQL = `WITH RECURSIVE node_descendants(id, can_recurse) AS (
    SELECT n.id, 1
    FROM nodes n
    INNER JOIN temp_workspace_search_seed_ids seeds
      ON seeds.id = n.id
    UNION ALL
    SELECT seeds.id, 0
    FROM temp_workspace_search_seed_ids seeds
    WHERE NOT EXISTS (
      SELECT 1 FROM nodes n WHERE n.id = seeds.id
    )
    UNION ALL
    SELECT child.id, 1
    FROM nodes child
    INNER JOIN node_descendants
      ON child.parent_id = node_descendants.id
    WHERE node_descendants.can_recurse = 1
  )
  INSERT OR IGNORE INTO temp_workspace_search_affected_ids (id)
  SELECT id
  FROM node_descendants`;

function toUniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function resetTempIds(driver: DatabaseDriver) {
  driver.execute(TEMP_SEED_IDS_SQL);
  driver.execute(TEMP_AFFECTED_IDS_SQL);
  driver.execute('DELETE FROM temp_workspace_search_seed_ids');
  driver.execute('DELETE FROM temp_workspace_search_affected_ids');
}

function writeTempSeedIds(driver: DatabaseDriver, ids: string[]) {
  const insertSeed = driver.prepare('INSERT OR IGNORE INTO temp_workspace_search_seed_ids (id) VALUES (?)');
  ids.forEach((id) => {
    insertSeed.run([id]);
  });
}

function countTempAffectedIds(driver: DatabaseDriver) {
  return (
    driver.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM temp_workspace_search_affected_ids')?.count ?? 0
  );
}

function traceSearchIndexSync(seedCount: number, expandedCount: number, elapsedMs: number) {
  if (typeof process === 'undefined' || process.env.FOLIOLE_SEARCH_INDEX_TRACE !== '1') {
    return;
  }
  console.info(`[searchIndex] seed=${seedCount} expanded=${expandedCount} elapsed=${elapsedMs.toFixed(1)}ms`);
}

function prepareAffectedNodeIds(driver: DatabaseDriver, nodeIds: string[], options: { includeDescendants: boolean }) {
  const seedIds = toUniqueIds(nodeIds);
  resetTempIds(driver);
  if (seedIds.length === 0) {
    return { expandedCount: 0, seedCount: 0 };
  }
  writeTempSeedIds(driver, seedIds);
  if (options.includeDescendants) {
    driver.execute(INSERT_AFFECTED_DESCENDANT_IDS_SQL);
  } else {
    driver.execute(
      `INSERT OR IGNORE INTO temp_workspace_search_affected_ids (id)
       SELECT id FROM temp_workspace_search_seed_ids`
    );
  }
  return { expandedCount: countTempAffectedIds(driver), seedCount: seedIds.length };
}

function requireAvailableNodeBodies(driver: DatabaseDriver, affectedOnly: boolean, storage: SearchBodyStorage) {
  if (storage === 'chunked') return prepareStableNodeSearchRows(driver, affectedOnly);
  const rows = driver.queryAll<{ id: string }>(`${NODE_PATHS_CTE_SQL}
    SELECT n.id FROM nodes n INNER JOIN node_paths paths ON paths.node_id = n.id
    LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
    WHERE NULLIF(TRIM(n.body_blob_hash), '') IS NOT NULL AND cbd.hash IS NULL
      ${affectedOnly ? 'AND n.id IN (SELECT id FROM temp_workspace_search_affected_ids)' : ''}`);
  if (rows.length > 0) throw new NodeBodyUnavailableError(rows.map((row) => row.id));
}

export function rebuildWorkspaceSearchIndexes(driver: DatabaseDriver, storage: SearchBodyStorage = 'continuous') {
  requireAvailableNodeBodies(driver, false, storage);
  driver.execute('DELETE FROM search.node_search');
  driver.execute('DELETE FROM search.pdf_search');
  if (storage === 'chunked') insertStableNodeSearchRows(driver);
  else driver.execute(NODE_SEARCH_REBUILD_SQL);
  driver.execute(PDF_SEARCH_REBUILD_SQL);
  refreshWorkspacePdfPageMap(driver);
}

export function syncNodeSearchIndexForNodeIds(driver: DatabaseDriver, nodeIds: string[], storage: SearchBodyStorage = 'continuous') {
  const startedAt = Date.now();
  const affected = prepareAffectedNodeIds(driver, nodeIds, { includeDescendants: false });
  if (affected.expandedCount === 0) {
    return;
  }
  requireAvailableNodeBodies(driver, true, storage);
  driver.execute('DELETE FROM search.node_search WHERE node_id IN (SELECT id FROM temp_workspace_search_affected_ids)');
  if (storage === 'chunked') insertStableNodeSearchRows(driver);
  else driver.execute(NODE_SEARCH_INSERT_AFFECTED_SQL);
  traceSearchIndexSync(affected.seedCount, affected.expandedCount, Date.now() - startedAt);
}

export function syncPdfSearchIndexForNodeIds(driver: DatabaseDriver, nodeIds: string[]) {
  const startedAt = Date.now();
  const affected = prepareAffectedNodeIds(driver, nodeIds, { includeDescendants: false });
  if (affected.expandedCount === 0) {
    return;
  }
  driver.execute('DELETE FROM search.pdf_search WHERE node_id IN (SELECT id FROM temp_workspace_search_affected_ids)');
  driver.execute(PDF_SEARCH_INSERT_AFFECTED_SQL);
  refreshWorkspacePdfPageMap(driver);
  traceSearchIndexSync(affected.seedCount, affected.expandedCount, Date.now() - startedAt);
}

export function syncWorkspaceSearchIndexForNodeIds(driver: DatabaseDriver, nodeIds: string[], storage: SearchBodyStorage = 'continuous') {
  const startedAt = Date.now();
  const affected = prepareAffectedNodeIds(driver, nodeIds, { includeDescendants: true });
  if (affected.expandedCount === 0) {
    return;
  }
  requireAvailableNodeBodies(driver, true, storage);
  driver.execute('DELETE FROM search.node_search WHERE node_id IN (SELECT id FROM temp_workspace_search_affected_ids)');
  driver.execute('DELETE FROM search.pdf_search WHERE node_id IN (SELECT id FROM temp_workspace_search_affected_ids)');
  if (storage === 'chunked') insertStableNodeSearchRows(driver);
  else driver.execute(NODE_SEARCH_INSERT_AFFECTED_SQL);
  driver.execute(PDF_SEARCH_INSERT_AFFECTED_SQL);
  refreshWorkspacePdfPageMap(driver);
  traceSearchIndexSync(affected.seedCount, affected.expandedCount, Date.now() - startedAt);
}

export function syncPdfSearchIndexForAttachmentIds(driver: DatabaseDriver, attachmentIds: string[]) {
  const nodeIds = new Set<string>();
  toUniqueIds(attachmentIds).forEach((attachmentId) => {
    const rows = driver.queryAll<{ node_id: string }>(
      `SELECT DISTINCT a.node_id FROM (${NODE_PDF_RESOURCES_SQL}) a WHERE a.id = ?`,
      [attachmentId]
    );
    rows.forEach((row) => {
      nodeIds.add(row.node_id);
    });
  });
  syncPdfSearchIndexForNodeIds(driver, [...nodeIds]);
}
