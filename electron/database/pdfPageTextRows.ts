import {
  enqueuePdfSearchInvalidationForAttachmentIds,
  enqueueWorkspaceSearchInvalidationForNodeIds
} from '../../lib/core/database/searchIndexInvalidations.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { syncPdfBodyBlobsForReferenceNodes } from './pdfBodyBlobs.js';

export interface PdfPageTextInput {
  page: number;
  pageHeight: number | null;
  pageWidth: number | null;
  text: string;
}

export function savePdfPageTextRows(
  attachmentId: string,
  pages: PdfPageTextInput[],
  now = new Date().toISOString()
) {
  const connection = openDatabaseConnection();
  const hostName = loadOrCreateDesktopHostName(now);
  const runInTransaction = connection.sqlite.transaction(() => {
    connection.driver.execute('DELETE FROM pdf_page_text WHERE attachment_id = ?', [attachmentId]);
    for (const page of pages) {
      connection.driver.execute(
        `INSERT INTO pdf_page_text (attachment_id, page, text, page_width, page_height)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(attachment_id, page) DO UPDATE SET
           text = excluded.text,
           page_width = excluded.page_width,
           page_height = excluded.page_height`,
        [attachmentId, page.page, page.text, page.pageWidth, page.pageHeight]
      );
    }
    const updatedBodyNodeIds = syncPdfBodyBlobsForReferenceNodes(attachmentId, pages, hostName, now);
    enqueuePdfSearchInvalidationForAttachmentIds(connection.driver, [attachmentId]);
    enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, updatedBodyNodeIds);
  });

  runInTransaction();
}

export function deletePdfPageTextRowsForAttachment(attachmentId: string) {
  const connection = openDatabaseConnection();
  connection.driver.execute('DELETE FROM pdf_page_text WHERE attachment_id = ?', [attachmentId]);
}
