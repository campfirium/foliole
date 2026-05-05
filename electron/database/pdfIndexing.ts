import fs from 'node:fs';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';

import { openDatabaseConnection } from './connection.js';

const PDF_MIME_TYPE = 'application/pdf';
const PDF_INDEX_VERSION = 1;
const RETRY_LIMIT = 2;

const PDF_STATUS_PENDING = 'pending';
const PDF_STATUS_INDEXING = 'indexing';
const PDF_STATUS_READY = 'ready';
const PDF_STATUS_FAILED = 'failed';

interface PdfQueueRow extends DatabaseRow {
  id: string;
}

interface PdfIndexAttemptRow extends DatabaseRow {
  pdf_index_attempt: number | null;
}

const queuedAttachmentIds = new Set<string>();
let isWorkerRunning = false;

function isPdfAttachment(attachmentId: string) {
  const row = openDatabaseConnection().driver.queryOne<{ id: string }>(
    `SELECT id
     FROM attachments
     WHERE id = ? AND mime_type = ?
     LIMIT 1`,
    [attachmentId, PDF_MIME_TYPE]
  );
  return Boolean(row);
}

function readPdfIndexAttempt(attachmentId: string) {
  const row = openDatabaseConnection().driver.queryOne<PdfIndexAttemptRow>(
    `SELECT pdf_index_attempt
     FROM attachments
     WHERE id = ?
     LIMIT 1`,
    [attachmentId]
  );
  return Math.max(0, row?.pdf_index_attempt ?? 0);
}

function updatePdfIndexStatus(input: {
  attachmentId: string;
  error: string | null;
  indexedAt: string | null;
  status: 'failed' | 'indexing' | 'pending' | 'ready';
}) {
  openDatabaseConnection().driver.execute(
    `UPDATE attachments
     SET pdf_index_status = ?,
         pdf_indexed_at = ?,
         pdf_index_error = ?,
         pdf_index_version = COALESCE(pdf_index_version, ?)
     WHERE id = ? AND mime_type = ?`,
    [input.status, input.indexedAt, input.error, PDF_INDEX_VERSION, input.attachmentId, PDF_MIME_TYPE]
  );
}

function beginIndexAttempt(attachmentId: string) {
  openDatabaseConnection().driver.execute(
    `UPDATE attachments
     SET pdf_index_status = ?,
         pdf_index_attempt = COALESCE(pdf_index_attempt, 0) + 1,
         pdf_index_error = NULL,
         pdf_index_version = COALESCE(pdf_index_version, ?)
     WHERE id = ? AND mime_type = ?`,
    [PDF_STATUS_INDEXING, PDF_INDEX_VERSION, attachmentId, PDF_MIME_TYPE]
  );
}

function resetPdfIndexState(attachmentId: string) {
  openDatabaseConnection().driver.execute(
    `UPDATE attachments
     SET pdf_index_status = ?,
         pdf_indexed_at = NULL,
         pdf_index_error = NULL,
         pdf_index_version = ?,
         pdf_index_attempt = 0
     WHERE id = ? AND mime_type = ?`,
    [PDF_STATUS_PENDING, PDF_INDEX_VERSION, attachmentId, PDF_MIME_TYPE]
  );
}

function resolvePdfPageText(content: { items: unknown[] }) {
  return content.items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      return 'str' in item && typeof item.str === 'string' ? item.str : '';
    })
    .join('');
}

async function extractPdfPageText(attachmentId: string) {
  const resolved = resolveAttachmentFile(attachmentId);
  if (resolved.status !== 'ready') {
    throw new Error('PDF attachment file is not available.');
  }

  const bytes = fs.readFileSync(resolved.filePath);
  const loadingTask = getDocument({
    data: bytes,
    isEvalSupported: false,
    useWorkerFetch: false
  });
  const document = await loadingTask.promise;
  try {
    const pages: Array<{ page: number; text: string }> = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      const pdfPage = await document.getPage(page);
      const textContent = await pdfPage.getTextContent();
      pages.push({ page, text: resolvePdfPageText(textContent) });
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

function savePdfPageTextRows(attachmentId: string, pages: Array<{ page: number; text: string }>) {
  const connection = openDatabaseConnection();
  const runInTransaction = connection.sqlite.transaction(() => {
    connection.driver.execute('DELETE FROM pdf_page_text WHERE attachment_id = ?', [attachmentId]);
    for (const page of pages) {
      connection.driver.execute(
        `INSERT INTO pdf_page_text (attachment_id, page, text)
         VALUES (?, ?, ?)
         ON CONFLICT(attachment_id, page) DO UPDATE SET text = excluded.text`,
        [attachmentId, page.page, page.text]
      );
    }
  });
  runInTransaction();
}

function enqueueInternal(attachmentId: string) {
  queuedAttachmentIds.add(attachmentId);
  void runQueueWorker();
}

async function processOneAttachment(attachmentId: string) {
  if (!isPdfAttachment(attachmentId)) {
    return;
  }

  beginIndexAttempt(attachmentId);

  try {
    const pages = await extractPdfPageText(attachmentId);
    savePdfPageTextRows(attachmentId, pages);
    updatePdfIndexStatus({ attachmentId, error: null, indexedAt: new Date().toISOString(), status: PDF_STATUS_READY });
  } catch (error) {
    const attempt = readPdfIndexAttempt(attachmentId);
    const message = error instanceof Error ? error.message : 'Unknown PDF indexing failure.';
    if (attempt <= RETRY_LIMIT) {
      updatePdfIndexStatus({ attachmentId, error: message, indexedAt: null, status: PDF_STATUS_PENDING });
      enqueueInternal(attachmentId);
      return;
    }
    updatePdfIndexStatus({ attachmentId, error: message, indexedAt: null, status: PDF_STATUS_FAILED });
  }
}

async function runQueueWorker() {
  if (isWorkerRunning) {
    return;
  }
  isWorkerRunning = true;
  try {
    while (queuedAttachmentIds.size > 0) {
      const attachmentId = queuedAttachmentIds.values().next().value;
      if (!attachmentId) {
        break;
      }
      queuedAttachmentIds.delete(attachmentId);
      await processOneAttachment(attachmentId);
    }
  } finally {
    isWorkerRunning = false;
    if (queuedAttachmentIds.size > 0) {
      void runQueueWorker();
    }
  }
}

export function enqueuePdfAttachmentIndexing(attachmentId: string) {
  if (!attachmentId.trim()) {
    return;
  }
  enqueueInternal(attachmentId);
}

export function markPdfAttachmentIndexPending(attachmentId: string) {
  if (!attachmentId.trim()) {
    return;
  }
  resetPdfIndexState(attachmentId);
}

export function resumePendingPdfAttachmentIndexing() {
  const rows = openDatabaseConnection().driver.queryAll<PdfQueueRow>(
    `SELECT id
     FROM attachments
     WHERE mime_type = ?
       AND pdf_index_status IN (?, ?)
     ORDER BY created_at ASC`,
    [PDF_MIME_TYPE, PDF_STATUS_PENDING, PDF_STATUS_INDEXING]
  );
  for (const row of rows) {
    enqueueInternal(row.id);
  }
}
