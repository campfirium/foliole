import type { DatabaseDriver, DatabaseRow } from './driver.js';

interface PdfImportInventoryRow extends DatabaseRow {
  last_imported_at: string;
  latest_node_id: string | null;
  node_status: 'deleted' | 'generated' | 'missing';
  pdf_index_status: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  pdf_indexed_at: string | null;
  source_fingerprint: string;
  source_locator: string;
  source_name: string;
}

export interface PdfImportInventoryItem {
  lastImportedAt: string;
  latestNodeId: string | null;
  nodeStatus: 'deleted' | 'generated' | 'missing';
  pdfIndexStatus: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  pdfIndexedAt: string | null;
  sourceFingerprint: string;
  sourceLocator: string;
  sourceName: string;
}

function toPdfImportInventoryItem(row: PdfImportInventoryRow): PdfImportInventoryItem {
  return {
    lastImportedAt: row.last_imported_at,
    latestNodeId: row.latest_node_id,
    nodeStatus: row.node_status,
    pdfIndexedAt: row.pdf_indexed_at,
    pdfIndexStatus: row.pdf_index_status,
    sourceFingerprint: row.source_fingerprint,
    sourceLocator: row.source_locator,
    sourceName: row.source_name
  };
}

export function loadPdfImportsInventory(driver: DatabaseDriver, limit = 200): PdfImportInventoryItem[] {
  const rows = driver.queryAll<PdfImportInventoryRow>(
    `SELECT
       source.source_fingerprint,
       source.source_name,
       source.source_locator,
       source.last_imported_at,
       source.latest_node_id,
       CASE
         WHEN source.latest_node_id IS NULL THEN 'missing'
         WHEN node.id IS NULL OR node.deleted_at IS NOT NULL THEN 'deleted'
         ELSE 'generated'
       END AS node_status,
       attachment.pdf_index_status,
       attachment.pdf_indexed_at
     FROM import_sources source
     LEFT JOIN nodes node ON node.id = source.latest_node_id
     LEFT JOIN attachments attachment
       ON attachment.id = (
         SELECT node_attachment.attachment_id
         FROM node_attachments node_attachment
         INNER JOIN attachments candidate_attachment
           ON candidate_attachment.id = node_attachment.attachment_id
          AND candidate_attachment.mime_type = 'application/pdf'
         WHERE node_attachment.node_id = source.latest_node_id
           AND node_attachment.role = 'reference'
         ORDER BY candidate_attachment.created_at DESC, node_attachment.attachment_id DESC
         LIMIT 1
       )
     WHERE source.source_kind = 'pdf'
     ORDER BY source.last_imported_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map(toPdfImportInventoryItem);
}
