import fs from 'node:fs';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { DatabaseRow } from '../../lib/core/database/driver.js';
import { resolveNodeOpeningText } from '../../lib/core/nodes/nodeOpeningPreview.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';

import { openDatabaseConnection, runWithDatabaseConnectionOwner } from './connection.js';
import { submitPdfIndexingTask } from './pdfIndexingTaskQueue.js';
import { beginPdfIndexAttempt, isMountedPdf, readPdfIndexState, resetPdfIndexState, updatePdfIndexStatus } from './pdfIndexState.js';
import { savePdfPageTextRows } from './pdfPageTextRows.js';

const RETRY_LIMIT = 2;

const PDF_STATUS_PENDING = 'pending';
const PDF_STATUS_INDEXING = 'indexing';
const PDF_STATUS_READY = 'ready';
const PDF_STATUS_FAILED = 'failed';

interface PdfQueueRow extends DatabaseRow {
  id: string;
}

const queuedAttachmentIds = new Set<string>();
interface PdfAttempt {
  number: number;
}
const activeAttempts = new Map<string, PdfAttempt>();

export function toPdfDocumentData(bytes: Uint8Array) {
  return new Uint8Array(bytes);
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

function resolvePdfPageDimensions(pdfPage: { getViewport: (input: { scale: number }) => { width?: number; height?: number } }) {
  const viewport = pdfPage.getViewport({ scale: 1 });
  if (
    typeof viewport.width !== 'number' ||
    !Number.isFinite(viewport.width) ||
    viewport.width <= 0 ||
    typeof viewport.height !== 'number' ||
    !Number.isFinite(viewport.height) ||
    viewport.height <= 0
  ) {
    return null;
  }
  return { height: viewport.height, width: viewport.width };
}

async function extractPdfPageText(attachmentId: string) {
  const resolved = resolveAttachmentFile(`${attachmentId}.pdf`);
  if (resolved.status !== 'ready') {
    throw new Error('PDF attachment file is not available.');
  }

  const bytes = fs.readFileSync(resolved.filePath);
  const loadingTask = getDocument({
    data: toPdfDocumentData(bytes),
    isEvalSupported: false,
    useWorkerFetch: false
  });
  const document = await loadingTask.promise;
  try {
    const pages: Array<{ page: number; text: string; pageHeight: number | null; pageWidth: number | null }> = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      const pdfPage = await document.getPage(page);
      const textContent = await pdfPage.getTextContent();
      const pageDimensions = resolvePdfPageDimensions(pdfPage);
      pages.push({
        page,
        pageHeight: pageDimensions?.height ?? null,
        pageWidth: pageDimensions?.width ?? null,
        text: resolvePdfPageText(textContent)
      });
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

function updatePdfNodeOpeningTexts(attachmentId: string, pages: Array<{ page: number; text: string }>) {
  const firstUsablePage = pages.find((page) => page.text.trim().length > 0);
  const connection = openDatabaseConnection();
  const linkedNodes = connection.driver.queryAll<{ node_id: string; title: string }>(
    `SELECT n.id AS node_id, n.title
     FROM nodes n, json_each(n.resource_references) resource
     WHERE json_extract(resource.value, '$.storage_key') = ?
       AND json_extract(resource.value, '$.role') = 'reference'`,
    [`${attachmentId}.pdf`]
  );
  for (const node of linkedNodes) {
    const openingText = firstUsablePage ? resolveNodeOpeningText(firstUsablePage.text, node.title) : null;
    connection.driver.execute('UPDATE nodes SET opening_text = ? WHERE id = ?', [
      openingText,
      node.node_id
    ]);
  }
}

function enqueueInternal(attachmentId: string) {
  if (queuedAttachmentIds.has(attachmentId)) {
    return;
  }
  queuedAttachmentIds.add(attachmentId);
  const handle = submitPdfIndexingTask(attachmentId, async () => {
    queuedAttachmentIds.delete(attachmentId);
    await processOneAttachment(attachmentId);
  });
  void handle.promise.catch(() => {
    queuedAttachmentIds.delete(attachmentId);
  });
}

function isCurrentAttempt(attachmentId: string, attempt: PdfAttempt) {
  if (activeAttempts.get(attachmentId) !== attempt || !isMountedPdf(attachmentId)) return false;
  const state = readPdfIndexState(attachmentId);
  return state?.status === PDF_STATUS_INDEXING && state.attempt === attempt.number;
}

function beginAttempt(attachmentId: string) {
  if (!isMountedPdf(attachmentId)) return null;
  const state = readPdfIndexState(attachmentId);
  if (!state || ![PDF_STATUS_PENDING, PDF_STATUS_INDEXING].includes(state.status)) return null;
  beginPdfIndexAttempt(attachmentId);
  const attempt = { number: state.attempt + 1 };
  activeAttempts.set(attachmentId, attempt);
  return attempt;
}

function commitAttempt(attachmentId: string, attempt: PdfAttempt, pages: Awaited<ReturnType<typeof extractPdfPageText>>) {
  const connection = openDatabaseConnection();
  connection.sqlite.transaction(() => {
    if (!isCurrentAttempt(attachmentId, attempt)) return;
    savePdfPageTextRows(attachmentId, pages);
    updatePdfNodeOpeningTexts(attachmentId, pages);
    updatePdfIndexStatus({ attachmentId, error: null, indexedAt: new Date().toISOString(), status: PDF_STATUS_READY });
  })();
}

function failAttempt(attachmentId: string, attempt: PdfAttempt, error: unknown) {
  if (!isCurrentAttempt(attachmentId, attempt)) return false;
  const message = error instanceof Error ? error.message : 'Unknown PDF indexing failure.';
  const retry = attempt.number <= RETRY_LIMIT;
  updatePdfIndexStatus({ attachmentId, error: message, indexedAt: null,
    status: retry ? PDF_STATUS_PENDING : PDF_STATUS_FAILED });
  return retry;
}

async function processOneAttachment(attachmentId: string) {
  const attempt = await runWithDatabaseConnectionOwner(() => beginAttempt(attachmentId));
  if (!attempt) return;
  try {
    const pages = await extractPdfPageText(attachmentId);
    await runWithDatabaseConnectionOwner(() => commitAttempt(attachmentId, attempt, pages));
  } catch (error) {
    const retry = await runWithDatabaseConnectionOwner(() => failAttempt(attachmentId, attempt, error));
    if (retry) enqueueInternal(attachmentId);
  } finally {
    if (activeAttempts.get(attachmentId) === attempt) activeAttempts.delete(attachmentId);
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
  activeAttempts.delete(attachmentId);
}

export async function resumePendingPdfAttachmentIndexing() {
  const rows = await runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.queryAll<PdfQueueRow>(
    `SELECT attachment_id AS id FROM pdf_index_state
     WHERE status IN (?, ?) ORDER BY attachment_id ASC`,
    [PDF_STATUS_PENDING, PDF_STATUS_INDEXING]
  ));
  for (const row of rows) enqueueInternal(row.id);
}
