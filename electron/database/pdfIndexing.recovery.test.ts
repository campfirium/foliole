// @vitest-environment node
import './pdfIndexingTestSupport.js';

import { expect, it } from 'vitest';

import { PDF_READER_PLACEHOLDER_TEXT } from '../../lib/core/nodes/nodeOpeningPreview.js';

import { openDatabaseConnection } from './connection.js';
import { enqueuePdfAttachmentIndexing, markPdfAttachmentIndexPending, resumePendingPdfAttachmentIndexing } from './pdfIndexing.js';
import { drainAttempts, extraction, pageText, pauseExtraction, pdfBytes, pdfId, readOriginalPdf, removeOriginalPdf, reopenDatabase, seedPriorText, status, tasks } from './pdfIndexingTestSupport.js';

it('keeps failed state and successful old rows after reopening a missing-file failure', async () => {
  seedPriorText();
  removeOriginalPdf();
  enqueuePdfAttachmentIndexing(pdfId);
  await drainAttempts(3);
  reopenDatabase();
  expect(status()).toEqual({ status: 'failed', attempt: 3, error: 'PDF attachment file is not available.' });
  expect(pageText()).toEqual([{ text: 'Prior successful page text' }]);
});

it('rolls back page text, body and index writes when a later opening write fails', async () => {
  seedPriorText();
  const { driver, sqlite } = openDatabaseConnection();
  driver.execute("UPDATE nodes SET content = ?, opening_text = 'Prior opening' WHERE id = 'pdf-topic'", [PDF_READER_PLACEHOLDER_TEXT]);
  const before = driver.queryAll('SELECT * FROM sync_object_state');
  const invalidations = driver.queryAll('SELECT * FROM search_index_invalidations');
  sqlite.exec(`CREATE TRIGGER fail_pdf_ready BEFORE UPDATE OF status ON pdf_index_state
    WHEN NEW.status = 'ready' BEGIN SELECT RAISE(ABORT, 'isolated opening write failure'); END`);
  enqueuePdfAttachmentIndexing(pdfId);
  await drainAttempts(3);
  expect(status()).toEqual({ status: 'failed', attempt: 3, error: 'isolated opening write failure' });
  expect(pageText()).toEqual([{ text: 'Prior successful page text' }]);
  expect(driver.queryOne("SELECT content, body_blob_hash, opening_text FROM nodes WHERE id = 'pdf-topic'"))
    .toEqual({ content: PDF_READER_PLACEHOLDER_TEXT, body_blob_hash: null, opening_text: 'Prior opening' });
  expect(driver.queryAll('SELECT * FROM sync_object_state')).toEqual(before);
  expect(driver.queryAll('SELECT * FROM search_index_invalidations')).toEqual(invalidations);
  expect(readOriginalPdf()).toEqual(pdfBytes);
});

it.each([false, true])('does not overwrite reset state after an older extraction fails=%s', async (fails) => {
  extraction.failPage = fails;
  seedPriorText();
  const paused = pauseExtraction();
  enqueuePdfAttachmentIndexing(pdfId);
  await paused.loaded;
  markPdfAttachmentIndexPending(pdfId);
  paused.release();
  await tasks[0];
  expect(status()).toEqual({ status: 'pending', attempt: 0, error: null });
  expect(pageText()).toEqual([{ text: 'Prior successful page text' }]);
  extraction.failPage = false;
  enqueuePdfAttachmentIndexing(pdfId);
  await tasks[1];
  expect(status()).toEqual({ status: 'ready', attempt: 1, error: null });
});

it.each([false, true])('does not resurrect removed PDF state after extraction fails=%s', async (fails) => {
  extraction.failPage = fails;
  const paused = pauseExtraction();
  enqueuePdfAttachmentIndexing(pdfId);
  await paused.loaded;
  const { driver } = openDatabaseConnection();
  driver.execute("UPDATE nodes SET resource_references = '[]' WHERE id = 'pdf-topic'");
  driver.execute('DELETE FROM pdf_index_state WHERE attachment_id = ?', [pdfId]);
  paused.release();
  await tasks[0];
  expect(status()).toBeUndefined();
  expect(pageText()).toEqual([]);
  expect(readOriginalPdf()).toEqual(pdfBytes);
});

it('resumes persisted indexing through the startup entry after database reopen', async () => {
  seedPriorText();
  openDatabaseConnection().driver.execute("UPDATE pdf_index_state SET status = 'indexing', attempt = 1 WHERE attachment_id = ?", [pdfId]);
  reopenDatabase();
  await resumePendingPdfAttachmentIndexing();
  await tasks[0];
  expect(status()).toEqual({ status: 'ready', attempt: 2, error: null });
  expect(pageText()).not.toEqual([{ text: 'Prior successful page text' }]);
  expect(readOriginalPdf()).toEqual(pdfBytes);
});
