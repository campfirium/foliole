// @vitest-environment node
import './pdfIndexingTestSupport.js';

import { expect, it } from 'vitest';

import { openDatabaseConnection } from './connection.js';
import { enqueuePdfAttachmentIndexing } from './pdfIndexing.js';
import { deferred, drainAttempts, extraction, holdOwner, pageText, pauseExtraction, pdfBytes, pdfId, readOriginalPdf, seedPriorText, status, tasks } from './pdfIndexingTestSupport.js';

it('indexes a real mounted PDF through the production scheduler', async () => {
  expect(openDatabaseConnection().driver.queryOne("SELECT name FROM sqlite_master WHERE name = 'attachments'")).toBeUndefined();
  enqueuePdfAttachmentIndexing(pdfId);
  await tasks[0];
  expect(status()).toEqual({ status: 'ready', attempt: 1, error: null });
  expect(pageText().length).toBeGreaterThan(0);
  expect(readOriginalPdf()).toEqual(pdfBytes);
});

it('waits for a competing owner before starting a durable attempt', async () => {
  const began = deferred();
  extraction.beforeProcess = began.release;
  const owner = await holdOwner();
  enqueuePdfAttachmentIndexing(pdfId);
  try {
    await began.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(status()).toEqual({ status: 'pending', attempt: 0, error: null });
  } finally { await owner.release(); }
  await tasks[0];
  expect(status()).toEqual({ status: 'ready', attempt: 1, error: null });
});

it('releases the owner during extraction and waits to commit without leaving indexing', async () => {
  seedPriorText();
  const paused = pauseExtraction();
  enqueuePdfAttachmentIndexing(pdfId);
  await paused.loaded;
  const finished = deferred();
  extraction.finished = finished.release;
  const owner = await holdOwner();
  try {
    expect(status()).toEqual({ status: 'indexing', attempt: 1, error: null });
    expect(pageText()).toEqual([{ text: 'Prior successful page text' }]);
    paused.release();
    await finished.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally { await owner.release(); }
  await tasks[0];
  expect(status()).toEqual({ status: 'ready', attempt: 1, error: null });
  expect(readOriginalPdf()).toEqual(pdfBytes);
});

it('waits for the owner to persist extraction failure and exhausts the retry limit', async () => {
  seedPriorText();
  extraction.failPage = true;
  const paused = pauseExtraction();
  enqueuePdfAttachmentIndexing(pdfId);
  await paused.loaded;
  const owner = await holdOwner();
  const finished = deferred();
  extraction.finished = finished.release;
  try { paused.release(); await finished.promise; await new Promise<void>((resolve) => setImmediate(resolve)); } finally { await owner.release(); }
  await drainAttempts(3);
  expect(status()).toEqual({ status: 'failed', attempt: 3, error: 'isolated extraction failure' });
  expect(pageText()).toEqual([{ text: 'Prior successful page text' }]);
  expect(readOriginalPdf()).toEqual(pdfBytes);
});
