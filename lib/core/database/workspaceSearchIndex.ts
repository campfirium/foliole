import type { DatabaseDriver } from './driver.js';
import { buildNodeBodyContentSql } from './nodeBodyResolution.js';

const NODE_BODY_CONTENT_SQL = buildNodeBodyContentSql();

const NODE_PATHS_CTE_SQL = `WITH RECURSIVE node_paths(node_id, path) AS (
    SELECT id, ''
    FROM nodes
    WHERE parent_id IS NULL
      AND deleted_at IS NULL
    UNION ALL
    SELECT
      child.id,
      CASE
        WHEN paths.path = '' THEN COALESCE(NULLIF(trim(parent.title), ''), 'Untitled')
        ELSE paths.path || ' / ' || COALESCE(NULLIF(trim(parent.title), ''), 'Untitled')
      END
    FROM nodes child
    INNER JOIN nodes parent
      ON parent.id = child.parent_id
     AND parent.deleted_at IS NULL
    INNER JOIN node_paths paths
      ON paths.node_id = parent.id
    WHERE child.deleted_at IS NULL
  )`;

const NODE_SEARCH_INSERT_AFFECTED_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO search.node_search (title, path, content, node_id, updated_at)
  SELECT trim(n.title), COALESCE(paths.path, ''), ${NODE_BODY_CONTENT_SQL}, n.id, n.updated_at
  FROM nodes n
  LEFT JOIN node_paths paths
    ON paths.node_id = n.id
  LEFT JOIN content_blob_data cbd
    ON cbd.hash = n.body_blob_hash
  WHERE n.id IN (SELECT id FROM temp_workspace_search_affected_ids)
    AND n.deleted_at IS NULL`;

const PDF_SEARCH_INSERT_AFFECTED_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO search.pdf_search (title, path, text, node_id, attachment_id, page, updated_at, page_text_length)
  SELECT
    COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document'),
    COALESCE(paths.path, ''),
    ppt.text,
    n.id,
    a.id,
    CAST(ppt.page AS TEXT),
    n.updated_at,
    CAST(length(ppt.text) AS TEXT)
  FROM node_attachments na
  INNER JOIN attachments a
    ON a.id = na.attachment_id
   AND a.mime_type = 'application/pdf'
   AND a.pdf_index_status = 'ready'
  INNER JOIN nodes n
    ON n.id = na.node_id
   AND n.deleted_at IS NULL
  LEFT JOIN node_paths paths
    ON paths.node_id = n.id
  INNER JOIN pdf_page_text ppt
    ON ppt.attachment_id = a.id
  WHERE na.node_id IN (SELECT id FROM temp_workspace_search_affected_ids)
    AND na.role = 'reference'`;

const NODE_SEARCH_REBUILD_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO search.node_search (title, path, content, node_id, updated_at)
  SELECT trim(n.title), COALESCE(paths.path, ''), ${NODE_BODY_CONTENT_SQL}, n.id, n.updated_at
  FROM nodes n
  LEFT JOIN node_paths paths
    ON paths.node_id = n.id
  LEFT JOIN content_blob_data cbd
    ON cbd.hash = n.body_blob_hash
  WHERE n.deleted_at IS NULL`;

const PDF_SEARCH_REBUILD_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO search.pdf_search (title, path, text, node_id, attachment_id, page, updated_at, page_text_length)
  SELECT
    COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document'),
    COALESCE(paths.path, ''),
    ppt.text,
    n.id,
    a.id,
    CAST(ppt.page AS TEXT),
    n.updated_at,
    CAST(length(ppt.text) AS TEXT)
  FROM pdf_page_text ppt
  INNER JOIN attachments a
    ON a.id = ppt.attachment_id
   AND a.mime_type = 'application/pdf'
   AND a.pdf_index_status = 'ready'
  INNER JOIN node_attachments na
    ON na.attachment_id = a.id
   AND na.role = 'reference'
  INNER JOIN nodes n
    ON n.id = na.node_id
   AND n.deleted_at IS NULL
  LEFT JOIN node_paths paths
    ON paths.node_id = n.id`;

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

export function rebuildWorkspaceSearchIndexes(driver: DatabaseDriver) {
  driver.execute('DELETE FROM search.node_search');
  driver.execute('DELETE FROM search.pdf_search');
  driver.execute(NODE_SEARCH_REBUILD_SQL);
  driver.execute(PDF_SEARCH_REBUILD_SQL);
}

export function syncNodeSearchIndexForNodeIds(driver: DatabaseDriver, nodeIds: string[]) {
  const startedAt = Date.now();
  const affected = prepareAffectedNodeIds(driver, nodeIds, { includeDescendants: false });
  if (affected.expandedCount === 0) {
    return;
  }
  driver.execute('DELETE FROM search.node_search WHERE node_id IN (SELECT id FROM temp_workspace_search_affected_ids)');
  driver.execute(NODE_SEARCH_INSERT_AFFECTED_SQL);
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
  traceSearchIndexSync(affected.seedCount, affected.expandedCount, Date.now() - startedAt);
}

export function syncWorkspaceSearchIndexForNodeIds(driver: DatabaseDriver, nodeIds: string[]) {
  const startedAt = Date.now();
  const affected = prepareAffectedNodeIds(driver, nodeIds, { includeDescendants: true });
  if (affected.expandedCount === 0) {
    return;
  }
  driver.execute('DELETE FROM search.node_search WHERE node_id IN (SELECT id FROM temp_workspace_search_affected_ids)');
  driver.execute('DELETE FROM search.pdf_search WHERE node_id IN (SELECT id FROM temp_workspace_search_affected_ids)');
  driver.execute(NODE_SEARCH_INSERT_AFFECTED_SQL);
  driver.execute(PDF_SEARCH_INSERT_AFFECTED_SQL);
  traceSearchIndexSync(affected.seedCount, affected.expandedCount, Date.now() - startedAt);
}

export function syncPdfSearchIndexForAttachmentIds(driver: DatabaseDriver, attachmentIds: string[]) {
  const nodeIds = new Set<string>();
  toUniqueIds(attachmentIds).forEach((attachmentId) => {
    const rows = driver.queryAll<{ node_id: string }>(
      `SELECT DISTINCT na.node_id
       FROM node_attachments na
       WHERE na.attachment_id = ?
         AND na.role = 'reference'`,
      [attachmentId]
    );
    rows.forEach((row) => {
      nodeIds.add(row.node_id);
    });
  });
  syncPdfSearchIndexForNodeIds(driver, [...nodeIds]);
}
