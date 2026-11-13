import { enqueuePdfSearchInvalidationForAttachmentIds } from '../../lib/core/database/searchIndexInvalidations.js';

import { openDatabaseConnection } from './connection.js';

export interface PdfPageTextInput {
  page: number;
  pageHeight: number | null;
  pageWidth: number | null;
  text: string;
}

export function savePdfPageTextRows(
  attachmentId: string,
  pages: PdfPageTextInput[]
) {
  const connection = openDatabaseConnection();
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
    enqueuePdfSearchInvalidationForAttachmentIds(connection.driver, [attachmentId]);
  });

  runInTransaction();
}

export function deletePdfPageTextRowsForAttachment(attachmentId: string) {
  const connection = openDatabaseConnection();
  connection.driver.execute('DELETE FROM pdf_page_text WHERE attachment_id = ?', [attachmentId]);
}
