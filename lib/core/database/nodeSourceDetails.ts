import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { loadNodeBodyResolution, resolveNodeBody, type NodeBodyRow } from './nodeBodyResolution.js';

interface ImportSourceRow extends DatabaseRow {
  first_imported_at: string;
  last_content_fingerprint: string;
  last_imported_at: string;
  latest_node_id: string | null;
  pdf_index_status: 'failed' | 'indexing' | 'pending' | 'ready' | null;
  pdf_indexed_at: string | null;
  provider: string;
  source_fingerprint: string;
  source_kind: string;
  source_location: string | null;
  source_locator: string;
  source_name: string;
  source_ref: string | null;
}

interface ImportRunRow extends DatabaseRow {
  content_fingerprint: string;
  degraded_reason: string | null;
  duplicate_semantic: 'duplicate' | 'new' | 'updated';
  failure_reason: string | null;
  id: string;
  imported_at: string;
  node_id: string | null;
  provider: 'desktop_text_file';
  result_status: 'degraded' | 'failed' | 'imported';
  source_fingerprint: string;
  source_kind: 'epub' | 'html' | 'markdown' | 'pdf' | 'text';
  source_locator: string;
  source_name: string;
}

interface KeepImportItemRow extends DatabaseRow {
  first_seen_at: string;
  has_source_update: number;
  local_node_state: 'active' | 'locally_deleted' | 'not_imported';
  last_imported_at: string | null;
  last_seen_at: string;
  last_status: 'blocked_deleted' | 'degraded' | 'duplicate' | 'failed' | 'imported';
  rule_id: string;
  source_mtime_ms: number;
  source_path: string;
  source_size_bytes: number;
  source_state: 'missing' | 'present';
}

interface PdfPageDimensionRow extends DatabaseRow {
  page: number;
  page_height: number | null;
  page_width: number | null;
}

interface NodeContextRow extends DatabaseRow, NodeBodyRow {
  anchor_link: string | null;
  id: string;
  parent_id: string | null;
}

export interface NodeSourceDetails {
  importRuns: ImportRunRow[];
  importSource: ImportSourceRow | null;
  inheritedFromParent: boolean;
  keepImportItem: KeepImportItemRow | null;
  pdfPageDimensions: PdfPageDimensionRow[];
  sourceNodeContent: string | null;
  sourceNodeBodyStatus: 'resolved' | 'unavailable';
  sourceNodeId: string;
}

function resolveSourceNodeContext(driver: DatabaseDriver, nodeId: string) {
  const node = driver.queryOne<NodeContextRow>(
    `SELECT n.id, n.parent_id, n.anchor_link, n.content, n.body_blob_hash, cbd.data AS body_blob_data
     FROM nodes n LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
     WHERE n.id = ?`,
    [nodeId]
  );
  if (!node) {
    return null;
  }
  if (node.anchor_link && node.parent_id) {
    const body = loadNodeBodyResolution(driver, node.parent_id);
    return {
      inheritedFromParent: true,
      sourceNodeContent: body?.status === 'resolved' ? body.content : null,
      sourceNodeBodyStatus: body?.status ?? 'unavailable',
      sourceNodeId: node.parent_id
    };
  }
  const body = resolveNodeBody(node);
  return {
    inheritedFromParent: false,
    sourceNodeContent: body.status === 'resolved' ? body.content : null,
    sourceNodeBodyStatus: body.status,
    sourceNodeId: node.id
  };
}

function readImportSource(driver: DatabaseDriver, nodeId: string) {
  return (
    driver.queryOne<ImportSourceRow>(
      `SELECT
         source_fingerprint,
         provider,
         source_kind,
         source_name,
         source_locator,
         source_ref,
         source_location,
         first_imported_at,
         last_imported_at,
         last_content_fingerprint,
         latest_node_id,
         attachment.pdf_index_status,
         attachment.pdf_indexed_at
       FROM import_sources
       LEFT JOIN node_attachments node_attachment
         ON node_attachment.node_id = import_sources.latest_node_id
        AND node_attachment.role = 'reference'
       LEFT JOIN attachments attachment
         ON attachment.id = node_attachment.attachment_id
        AND attachment.mime_type = 'application/pdf'
       WHERE latest_node_id = ?
       ORDER BY CASE WHEN lower(source_kind) = 'pdf' THEN 0 ELSE 1 END, last_imported_at DESC
       LIMIT 1`,
      [nodeId]
    ) ?? null
  );
}

function readImportRuns(driver: DatabaseDriver, nodeId: string, limit: number) {
  return driver.queryAll<ImportRunRow>(
    `SELECT
       id,
       source_fingerprint,
       provider,
       source_kind,
       source_name,
       source_locator,
       content_fingerprint,
       duplicate_semantic,
       result_status,
       node_id,
       imported_at,
       degraded_reason,
       failure_reason
     FROM import_runs
     WHERE node_id = ?
     ORDER BY imported_at DESC
     LIMIT ?`,
    [nodeId, limit]
  );
}

function readKeepImportItem(driver: DatabaseDriver, nodeId: string) {
  return (
    driver.queryOne<KeepImportItemRow>(
      `SELECT
         rule_id,
         source_path,
         source_mtime_ms,
         source_size_bytes,
         source_state,
         local_node_state,
         has_source_update,
         last_status,
         first_seen_at,
         last_seen_at,
         last_imported_at
       FROM keep_import_items
       WHERE last_node_id = ?
       ORDER BY
         CASE WHEN last_imported_at IS NULL THEN 1 ELSE 0 END,
         last_imported_at DESC,
         last_seen_at DESC
       LIMIT 1`,
      [nodeId]
    ) ?? null
  );
}

function readPdfPageDimensions(driver: DatabaseDriver, nodeId: string) {
  return driver.queryAll<PdfPageDimensionRow>(
    `SELECT
       pdf_page_text.page,
       pdf_page_text.page_width,
       pdf_page_text.page_height
     FROM node_attachments
     INNER JOIN attachments
       ON attachments.id = node_attachments.attachment_id
      AND attachments.mime_type = 'application/pdf'
     INNER JOIN pdf_page_text
       ON pdf_page_text.attachment_id = attachments.id
     WHERE node_attachments.node_id = ?
       AND node_attachments.role = 'reference'
     ORDER BY pdf_page_text.page ASC`,
    [nodeId]
  );
}

export function loadNodeSourceDetails(driver: DatabaseDriver, nodeId: string, runLimit = 6): NodeSourceDetails | null {
  const context = resolveSourceNodeContext(driver, nodeId);
  if (!context) {
    return null;
  }

  return {
    importRuns: readImportRuns(driver, context.sourceNodeId, runLimit),
    importSource: readImportSource(driver, context.sourceNodeId),
    inheritedFromParent: context.inheritedFromParent,
    keepImportItem: readKeepImportItem(driver, context.sourceNodeId),
    pdfPageDimensions: readPdfPageDimensions(driver, context.sourceNodeId),
    sourceNodeContent: context.sourceNodeContent,
    sourceNodeBodyStatus: context.sourceNodeBodyStatus,
    sourceNodeId: context.sourceNodeId
  };
}
