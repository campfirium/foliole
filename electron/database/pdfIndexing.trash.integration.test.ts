// @vitest-environment node
import './pdfIndexingTestSupport.js';

import { expect, it } from 'vitest';

import { deleteNodesPermanently, restoreNodes, softDeleteNodes } from './nodeMutations.js';
import { searchCurrentPdfDocument } from './pdfDocumentSearch.js';
import { enqueuePdfAttachmentIndexing } from './pdfIndexing.js';
import { pageText, pauseExtraction, pdfId, status, tasks } from './pdfIndexingTestSupport.js';

const nodeIds = ['pdf-topic'];
const deletedAt = '2026-10-02T00:00:00.000Z';

it('makes the original PDF searchable after restoring its sole owner during indexing', async () => {
  const paused = pauseExtraction();
  enqueuePdfAttachmentIndexing(pdfId);
  await paused.loaded;
  try {
    expect(status()).toMatchObject({ status: 'indexing' });
    softDeleteNodes({ nodeIds, deletedAt });
  } finally {
    paused.release();
  }
  await tasks[0];
  expect(restoreNodes({ nodeIds }).restoredNodeIds).toEqual(nodeIds);
  expect(searchCurrentPdfDocument('pdf-topic', 'gamma keyword')).toMatchObject({
    status: 'ready', matches: [{ page: 3 }]
  });
});

it('discards an earlier extraction after permanently deleting its sole owner', async () => {
  const paused = pauseExtraction();
  enqueuePdfAttachmentIndexing(pdfId);
  await paused.loaded;
  try {
    softDeleteNodes({ nodeIds, deletedAt });
    deleteNodesPermanently({ nodeIds });
  } finally {
    paused.release();
  }
  await tasks[0];
  expect(status()).toBeUndefined();
  expect(pageText()).toEqual([]);
});
