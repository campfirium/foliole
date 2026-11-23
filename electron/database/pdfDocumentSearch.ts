import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { NODE_PDF_RESOURCES_SQL } from '../../lib/core/database/nodePdfResourcesSql.js';
import { searchPdfDocumentText } from '../../lib/core/pdf/pdfDocumentTextSearch.js';

import { openDatabaseConnection } from './connection.js';

interface PdfAttachmentRow extends DatabaseRow {
  attachment_id: string;
  pdf_index_status: 'failed' | 'indexing' | 'pending' | 'ready' | null;
}

interface PdfPageTextRow extends DatabaseRow {
  page: number;
  text: string;
}

function findPdfAttachment(nodeId: string) {
  return openDatabaseConnection().driver.queryOne<PdfAttachmentRow>(
    `SELECT attachment.id AS attachment_id, attachment.pdf_index_status
     FROM nodes selected
     INNER JOIN nodes source
       ON source.id = CASE
         WHEN selected.anchor_link IS NOT NULL AND selected.parent_id IS NOT NULL THEN selected.parent_id
         ELSE selected.id
       END
     INNER JOIN (${NODE_PDF_RESOURCES_SQL}) attachment ON attachment.node_id = source.id
     WHERE selected.id = ?
     ORDER BY attachment.storage_key ASC
     LIMIT 1`,
    [nodeId]
  );
}

export function searchCurrentPdfDocument(nodeId: string, query: string) {
  const attachment = findPdfAttachment(nodeId);
  const status = attachment?.pdf_index_status ?? 'unavailable';
  if (!attachment || status !== 'ready' || !query.trim()) {
    return { matches: [], status };
  }
  const pages = openDatabaseConnection().driver.queryAll<PdfPageTextRow>(
    `SELECT page, text
     FROM pdf_page_text
     WHERE attachment_id = ?
     ORDER BY page ASC`,
    [attachment.attachment_id]
  );
  return { matches: searchPdfDocumentText(pages, query), status };
}

export function readCurrentPdfDocumentPage(nodeId: string, page: number) {
  const attachment = findPdfAttachment(nodeId);
  const status = attachment?.pdf_index_status ?? 'unavailable';
  if (!attachment || status !== 'ready') return { page: null, pageCount: 0, status };
  const { driver } = openDatabaseConnection();
  const count = driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM pdf_page_text WHERE attachment_id = ?',
    [attachment.attachment_id]
  )?.count ?? 0;
  const row = driver.queryOne<PdfPageTextRow>(
    'SELECT page, text FROM pdf_page_text WHERE attachment_id = ? AND page = ?',
    [attachment.attachment_id, page]
  );
  return { page: row ?? null, pageCount: count, status };
}

export function readCurrentPdfDocumentPageTexts(nodeId: string, pages: readonly number[]) {
  const attachment = findPdfAttachment(nodeId);
  if (!attachment || attachment.pdf_index_status !== 'ready' || !pages.length) return new Map<number, string>();
  const rows = openDatabaseConnection().driver.queryAll<PdfPageTextRow>(
    `SELECT page, text FROM pdf_page_text WHERE attachment_id = ? AND page IN (${pages.map(() => '?').join(', ')})`,
    [attachment.attachment_id, ...pages]
  );
  return new Map(rows.map((row) => [row.page, row.text]));
}
