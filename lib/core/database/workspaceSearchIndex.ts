import type { DatabaseDriver } from './driver.js';

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

const NODE_SEARCH_INSERT_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO node_search (title, path, content, node_id, updated_at)
  SELECT trim(n.title), COALESCE(paths.path, ''), COALESCE(CAST(cbd.data AS TEXT), n.content), n.id, n.updated_at
  FROM nodes n
  LEFT JOIN node_paths paths
    ON paths.node_id = n.id
  LEFT JOIN content_blob_data cbd
    ON cbd.hash = n.body_blob_hash
  WHERE n.id = ?
    AND n.deleted_at IS NULL`;

const PDF_SEARCH_INSERT_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO pdf_search (title, path, text, node_id, attachment_id, page, updated_at, page_text_length)
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
  WHERE na.node_id = ?
    AND na.role = 'reference'`;

const NODE_SEARCH_REBUILD_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO node_search (title, path, content, node_id, updated_at)
  SELECT trim(n.title), COALESCE(paths.path, ''), COALESCE(CAST(cbd.data AS TEXT), n.content), n.id, n.updated_at
  FROM nodes n
  LEFT JOIN node_paths paths
    ON paths.node_id = n.id
  LEFT JOIN content_blob_data cbd
    ON cbd.hash = n.body_blob_hash
  WHERE n.deleted_at IS NULL`;

const PDF_SEARCH_REBUILD_SQL = `${NODE_PATHS_CTE_SQL}
  INSERT INTO pdf_search (title, path, text, node_id, attachment_id, page, updated_at, page_text_length)
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

const NODE_DESCENDANT_IDS_SQL = `WITH RECURSIVE node_descendants(id) AS (
    SELECT id
    FROM nodes
    WHERE id = ?
    UNION ALL
    SELECT child.id
    FROM nodes child
    INNER JOIN node_descendants
      ON child.parent_id = node_descendants.id
  )
  SELECT id
  FROM node_descendants`;

function toUniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function expandNodeIdsForPathSync(driver: DatabaseDriver, nodeIds: string[]) {
  const expandedIds = new Set<string>();
  toUniqueIds(nodeIds).forEach((nodeId) => {
    const rows = driver.queryAll<{ id: string }>(NODE_DESCENDANT_IDS_SQL, [nodeId]);
    if (rows.length === 0) {
      expandedIds.add(nodeId);
      return;
    }
    rows.forEach((row) => {
      expandedIds.add(row.id);
    });
  });
  return [...expandedIds];
}

function deleteById(statement: ReturnType<DatabaseDriver['prepare']>, ids: string[]) {
  toUniqueIds(ids).forEach((id) => {
    statement.run([id]);
  });
}

function insertById(statement: ReturnType<DatabaseDriver['prepare']>, ids: string[]) {
  toUniqueIds(ids).forEach((id) => {
    statement.run([id]);
  });
}

export function rebuildWorkspaceSearchIndexes(driver: DatabaseDriver) {
  driver.execute('DELETE FROM node_search');
  driver.execute('DELETE FROM pdf_search');
  driver.execute(NODE_SEARCH_REBUILD_SQL);
  driver.execute(PDF_SEARCH_REBUILD_SQL);
}

export function syncNodeSearchIndexForNodeIds(driver: DatabaseDriver, nodeIds: string[]) {
  const deleteStatement = driver.prepare('DELETE FROM node_search WHERE node_id = ?');
  const insertStatement = driver.prepare(NODE_SEARCH_INSERT_SQL);
  deleteById(deleteStatement, nodeIds);
  insertById(insertStatement, nodeIds);
}

export function syncPdfSearchIndexForNodeIds(driver: DatabaseDriver, nodeIds: string[]) {
  const deleteStatement = driver.prepare('DELETE FROM pdf_search WHERE node_id = ?');
  const insertStatement = driver.prepare(PDF_SEARCH_INSERT_SQL);
  deleteById(deleteStatement, nodeIds);
  insertById(insertStatement, nodeIds);
}

export function syncWorkspaceSearchIndexForNodeIds(driver: DatabaseDriver, nodeIds: string[]) {
  const uniqueIds = expandNodeIdsForPathSync(driver, nodeIds);
  if (uniqueIds.length === 0) {
    return;
  }
  syncNodeSearchIndexForNodeIds(driver, uniqueIds);
  syncPdfSearchIndexForNodeIds(driver, uniqueIds);
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
