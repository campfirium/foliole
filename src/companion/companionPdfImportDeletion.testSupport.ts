import { expect, vi } from 'vitest';

import * as pdfPageReader from '../../lib/core/pdf/pdfPageTextExtraction';
import type { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { purgeCompanionTrashBatch } from '../shared/platform/companion/runtime/companionWorkspaceBatchPurge';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { moveCompanionBatchToTrash, type CompanionBatchTarget } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { loadIosPdfPageText, searchIosPdfPageText } from '../shared/platform/companion/runtime/iosCompanionActiveDatabaseReads';
import { searchCompanionFullTextSnapshot } from '../shared/platform/companionFullTextSearch';

type ImportFixture = {
  importPdf(name?: string): Promise<unknown>;
  library: Awaited<ReturnType<typeof createSearchLibrary>>;
  storageKey: string;
};

export async function verifyPdfIndexAfterTopicDeletion(
  mode: 'trash' | 'purge' | 'shared', { importPdf, library, storageKey }: ImportFixture
) {
  const read = pdfPageReader.readPdfTextPage;
  const spy = vi.spyOn(pdfPageReader, 'readPdfTextPage');
  if (mode === 'shared') {
    spy.mockRejectedValueOnce(new Error('Initial index unavailable'));
    expect(await importPdf('Shared.pdf')).toHaveProperty('nodeId');
  }
  const paused = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  spy.mockImplementation(async (...args) => {
    const page = await read(...args);
    if (args[1] === 1) { paused.resolve(); await resume.promise; }
    return page;
  });
  const current = () => library.database.prepare('SELECT id, current_version_id AS version FROM nodes WHERE title = ?')
    .get('Reading') as CompanionBatchTarget;
  const incoming = importPdf();
  try {
    await Promise.race([paused.promise, incoming.then(() => { throw new Error('Import ended before PDF extraction'); })]);
    await moveCompanionBatchToTrash([current()]);
    if (mode === 'purge') await purgeCompanionTrashBatch({ roots: [current()], entries: [current()] });
    expect((await searchCompanionFullTextSnapshot('gamma')).pdf).toEqual([]);
  } finally {
    resume.resolve();
  }
  expect(await incoming).toHaveProperty('nodeId');
  const hash = storageKey.slice(0, 64);
  const matches = [expect.objectContaining({ attachment_id: hash, page: 3 })];
  expect(await searchIosPdfPageText('gamma')).toEqual(mode === 'shared' ? matches : []);
  expect((await searchCompanionFullTextSnapshot('gamma')).pdf).toEqual(mode === 'shared' ? matches : []);
  if (mode === 'trash') {
    await restoreCompanionBatchFromTrash([current()]);
    expect(await searchIosPdfPageText('gamma')).toEqual(matches);
  } else if (mode === 'purge') {
    expect(await loadIosPdfPageText(hash)).toEqual([]);
    expect(library.database.prepare('SELECT * FROM pdf_text_artifact WHERE pdf_hash = ?').get(hash)).toBeUndefined();
    expect(library.database.prepare('SELECT * FROM pdf_index_state WHERE attachment_id = ?').get(hash)).toBeUndefined();
  }
}
