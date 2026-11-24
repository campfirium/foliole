// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { normalizeExportBook, normalizeReaderDocument } from '../../lib/core/readwise/readwiseApiContract.js';
import { createReadwiseApiCandidateFactFetcher } from '../import/readwiseApiCandidateFacts.js';
import type { ReadwiseApiCandidate } from '../import/readwiseApiCandidateTypes.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { loadPreparedReadwiseApiCandidate, saveReadwiseApiCandidates } from './readwiseApiCandidateStage.js';
import { INDEX_READER_KIND, saveReadwiseApiExportIndexPage, saveReadwiseApiReaderIndexPage } from './readwiseApiIndexStage.js';
import { measureSqlStatements } from './sqlStatementMeter.testSupport.js';
import { closeLibraries, createPeer, startLibraries, type Peer } from './syncLibrary.testSupport.js';

let driver: Peer['driver'];
let peer: Peer;
vi.mock('../import/readwiseApiImportFetch.js', () => ({
  createReadwiseApiRequest: () => async () => { throw new Error('unexpected_remote_reader_request'); }
}));
vi.mock('./connection.js', () => ({
  openDatabaseConnection: () => ({ driver }),
  runWithDatabaseConnectionOwner: async (run: () => unknown) => run()
}));

beforeEach(async () => {
  await startLibraries();
  peer = createPeer('candidate');
  driver = peer.driver;
});
afterEach(closeLibraries);

const candidate: ReadwiseApiCandidate = { destination: 'inbox', documentId: 'article', exportCategory: null,
  hasHighlights: true, highlightIds: ['highlight'], noteIds: ['highlight-note'], readerCategory: 'article',
  status: 'ready', title: 'Article' };

function saveDocument(id: string, highlightId: string) {
  saveReadwiseApiReaderIndexPage('reader', [
    normalizeReaderDocument({ id, category: 'article', html_content: '<p>Saved body</p>' })!,
    normalizeReaderDocument({ id: highlightId, category: 'highlight', parent_id: id })!,
    normalizeReaderDocument({ id: `${highlightId}-note`, category: 'note', parent_id: highlightId })!
  ]);
  saveReadwiseApiExportIndexPage('reader', [normalizeExportBook({
    external_id: id, category: 'articles', source: 'reader',
    highlights: [{ external_id: highlightId, text: 'Saved highlight', note: 'Saved note' }]
  })!]);
}

function seedCandidate() {
  peer.db.transaction(() => {
    for (let index = 0; index < 80; index++) saveDocument(`other-${index}`, `other-highlight-${index}`);
    saveDocument('article', 'highlight');
    saveReadwiseApiCandidates('reader', [candidate]);
  })();
}

it('reads only one resumed candidate and joins retained highlight facts with its export', async () => {
  seedCandidate();
  driver.execute(`DELETE FROM readwise_api_import_stage WHERE connection_ref = 'reader'
    AND record_kind = ? AND remote_id IN ('highlight', 'highlight-note')`, [INDEX_READER_KIND]);

  const reopened = new Database(peer.file);
  driver = createBetterSqlite3Driver(reopened);
  try {
    const { result, report } = await measureSqlStatements(() => loadPreparedReadwiseApiCandidate('reader', 'article'));
    expect(result).toMatchObject({ id: 'article', unmatchedAnnotationCount: 0,
      annotations: [{ remoteId: 'highlight', locatorText: 'Saved highlight' }] });
    expect(result?.body).toContain('Saved body');
    expect(result?.annotations[0]?.content).toContain('Saved note');
    expect(report.rowsRead).toBeLessThanOrEqual(6);
  } finally {
    reopened.close();
  }
});

it('prepares one queued document using only its already indexed Reader facts', async () => {
  seedCandidate();
  const prepare = createReadwiseApiCandidateFactFetcher('reader');
  const { result, report } = await measureSqlStatements(() => prepare(candidate));
  expect(result).toBe('ready');
  expect(report.rowsRead).toBeLessThanOrEqual(6);
});
