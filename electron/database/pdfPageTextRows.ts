import type { DatabaseRow } from '../../lib/core/database/driver.js';
import {
  computeSyncContentHash,
  upsertSyncObjectState,
  type StateSyncObjectType
} from '../../lib/core/database/syncState.js';
import { syncPdfSearchIndexForAttachmentIds } from '../../lib/core/database/workspaceSearchIndex.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';

export interface PdfPageTextInput {
  page: number;
  pageHeight: number | null;
  pageWidth: number | null;
  text: string;
}

interface ExistingPdfPageRow extends DatabaseRow {
  page: number;
}

const PDF_PAGE_TEXT_OBJECT_TYPE: StateSyncObjectType = 'pdf_page_text';

function toPdfPageTextObjectId(attachmentId: string, page: number) {
  return `${attachmentId}:${page}`;
}

function computePdfPageTextHash(attachmentId: string, page: PdfPageTextInput) {
  return computeSyncContentHash(PDF_PAGE_TEXT_OBJECT_TYPE, toPdfPageTextPayload(attachmentId, page));
}

function toPdfPageTextPayload(attachmentId: string, page: PdfPageTextInput) {
  return {
    attachment_id: attachmentId,
    page: page.page,
    page_height: page.pageHeight,
    page_width: page.pageWidth,
    text: page.text
  };
}

function computePdfPageTextTombstoneHash(attachmentId: string, page: number, deletedAt: string) {
  return computeSyncContentHash(PDF_PAGE_TEXT_OBJECT_TYPE, {
    deleted_at: deletedAt,
    object_id: toPdfPageTextObjectId(attachmentId, page),
    object_type: PDF_PAGE_TEXT_OBJECT_TYPE
  });
}

function recordPdfPageTextDeleted(attachmentId: string, page: number, deviceId: string, deletedAt: string) {
  const contentHash = computePdfPageTextTombstoneHash(attachmentId, page, deletedAt);
  upsertSyncObjectState(openDatabaseConnection().driver, {
    objectType: PDF_PAGE_TEXT_OBJECT_TYPE,
    objectId: toPdfPageTextObjectId(attachmentId, page),
    contentHash,
    deletedAt,
    lastModifiedByDeviceId: deviceId,
    updatedAt: deletedAt,
    syncDirty: true
  });
}

export function savePdfPageTextRows(
  attachmentId: string,
  pages: PdfPageTextInput[],
  now = new Date().toISOString()
) {
  const connection = openDatabaseConnection();
  const deviceId = loadOrCreateDesktopDeviceId(now);
  const existingPages = connection.driver.queryAll<ExistingPdfPageRow>(
    'SELECT page FROM pdf_page_text WHERE attachment_id = ? ORDER BY page ASC',
    [attachmentId]
  );
  const nextPages = new Set(pages.map((page) => page.page));

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
      const contentHash = computePdfPageTextHash(attachmentId, page);
      upsertSyncObjectState(connection.driver, {
        objectType: PDF_PAGE_TEXT_OBJECT_TYPE,
        objectId: toPdfPageTextObjectId(attachmentId, page.page),
        contentHash,
        lastModifiedByDeviceId: deviceId,
        updatedAt: now,
        syncDirty: true
      });
    }
    for (const row of existingPages) {
      if (nextPages.has(row.page)) {
        continue;
      }
      recordPdfPageTextDeleted(attachmentId, row.page, deviceId, now);
    }
  });

  runInTransaction();
  syncPdfSearchIndexForAttachmentIds(connection.driver, [attachmentId]);
}

export function deletePdfPageTextRowsForAttachment(attachmentId: string, deletedAt = new Date().toISOString()) {
  const connection = openDatabaseConnection();
  const deviceId = loadOrCreateDesktopDeviceId(deletedAt);
  const existingPages = connection.driver.queryAll<ExistingPdfPageRow>(
    'SELECT page FROM pdf_page_text WHERE attachment_id = ? ORDER BY page ASC',
    [attachmentId]
  );
  for (const row of existingPages) {
    recordPdfPageTextDeleted(attachmentId, row.page, deviceId, deletedAt);
  }
  connection.driver.execute('DELETE FROM pdf_page_text WHERE attachment_id = ?', [attachmentId]);
}
