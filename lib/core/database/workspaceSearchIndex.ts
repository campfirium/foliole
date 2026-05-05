import type { DatabaseDriver } from './driver.js';

const NODE_SEARCH_INSERT_SQL = `INSERT INTO node_search (title, content, node_id, updated_at)
  SELECT trim(title), content, id, updated_at
  FROM nodes
  WHERE id = ?
    AND deleted_at IS NULL`;

const PDF_SEARCH_INSERT_SQL = `INSERT INTO pdf_search (title, text, node_id, attachment_id, page, updated_at, page_text_length)
  SELECT
    COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document'),
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
  INNER JOIN pdf_page_text ppt
    ON ppt.attachment_id = a.id
  WHERE na.node_id = ?
    AND na.role = 'reference'`;

function toUniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
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
  driver.execute(
    `INSERT INTO node_search (title, content, node_id, updated_at)
     SELECT trim(title), content, id, updated_at
     FROM nodes
     WHERE deleted_at IS NULL`
  );
  driver.execute(
    `INSERT INTO pdf_search (title, text, node_id, attachment_id, page, updated_at, page_text_length)
     SELECT
       COALESCE(NULLIF(trim(a.original_name), ''), 'PDF Document'),
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
      AND n.deleted_at IS NULL`
  );
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
  const uniqueIds = toUniqueIds(nodeIds);
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
