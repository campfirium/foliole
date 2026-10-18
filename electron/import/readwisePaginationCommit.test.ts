// @vitest-environment node
import './readwisePagination.testSupport.js';

import { expect, it } from 'vitest';

import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { loadReadwiseApiCompletedThrough, loadReadwiseApiImportSource } from '../database/readwiseApiImportState.js';
import { loadReadwiseApiScopeLedgers } from '../database/readwiseApiScopeLedger.js';

import { runReadwiseApiImport } from './readwiseApiImportRun.js';
import { apiSettings, importedReadwiseApiCount, readerDocument, response } from './readwiseApiImportRun.testSupport.js';

it('recovers a bad export page after reopening, commits complete highlights, and deduplicates overlap', async () => {
  let broken = true;
  let incremental = false;
  const urls: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    urls.push(url);
    if (url.pathname.includes('/v2/export/')) {
      if (!url.searchParams.has('pageCursor')) return response([], 'export-next');
      if (broken) return Response.json({ nextPageCursor: null });
      return response([{ source: 'reader', external_id: 'doc', highlights: [
        { external_id: 'h1', text: 'Body doc', note: 'Preserved note' }
      ] }]);
    }
    const category = url.searchParams.get('category');
    if (category === 'highlight') return response([{ id: 'h1', category: 'highlight', parent_id: 'doc' }]);
    if (category === 'article') {
      const after = url.searchParams.get('updatedAfter');
      const gap = incremental && after && Date.parse(after) < Date.now() - 60_000;
      return response([readerDocument('doc', 'article'), ...(gap ? [readerDocument('gap', 'article')] : [])]);
    }
    if (category) return response([]);
    return response([readerDocument(url.searchParams.get('id') ?? 'doc', 'article')]);
  };
  const run = () => runReadwiseApiImport({ settings: apiSettings(), dependencies: { fetchImpl, minIntervalMs: 0 } });
  await expect(run()).rejects.toThrow('readwise_api_page_invalid');
  expect(loadReadwiseApiCompletedThrough('connection')).toBeNull();
  expect(importedReadwiseApiCount()).toBe(0);
  expect(loadReadwiseApiScopeLedgers('connection').find((x) => x.scope === 'export'))
    .toMatchObject({ cursor: 'export-next', checkpoint: null, status: 'running' });
  closeDatabaseConnection();
  openDatabaseConnection();
  broken = false;
  urls.length = 0;
  expect((await run()).status).toBe('completed');
  expect(urls[0]?.searchParams.get('pageCursor')).toBe('export-next');
  expect(importedReadwiseApiCount()).toBe(1);
  const original = loadReadwiseApiImportSource('connection', 'doc');
  expect(original?.state.annotations).toHaveLength(1);
  const ledgers = loadReadwiseApiScopeLedgers('connection');
  expect(ledgers.every((x) => x.checkpoint === x.runStartedAt)).toBe(true);
  incremental = true;
  urls.length = 0;
  expect((await run()).status).toBe('completed');
  expect(importedReadwiseApiCount()).toBe(2);
  for (const url of urls.filter((x) => !x.searchParams.has('id'))) {
    const scope = url.pathname.includes('/v2/export/') ? 'export' : `reader:${url.searchParams.get('category')}`;
    const checkpoint = ledgers.find((x) => x.scope === scope)?.checkpoint;
    expect(url.searchParams.get('updatedAfter')).toBe(new Date(Date.parse(checkpoint ?? '') - 300_000).toISOString());
  }
  expect(loadReadwiseApiImportSource('connection', 'doc')?.annotations).toEqual(original?.annotations);
  expect(loadReadwiseApiImportSource('connection', 'doc')?.body).toBe(original?.body);
});
