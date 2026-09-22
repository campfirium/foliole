import type { DatabaseRow } from '../../lib/core/database/driver.js';
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
     INNER JOIN node_attachments node_attachment
       ON node_attachment.node_id = source.id AND node_attachment.role = 'reference'
     INNER JOIN attachments attachment
       ON attachment.id = node_attachment.attachment_id AND attachment.mime_type = 'application/pdf'
     WHERE selected.id = ?
     ORDER BY attachment.created_at ASC
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
