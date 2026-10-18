// @vitest-environment node
import './readwisePagination.testSupport.js';

import { expect, it } from 'vitest';

import { loadReadwiseApiReaderIndex } from '../database/readwiseApiIndexStage.js';
import { loadReadwiseApiScopeLedgers } from '../database/readwiseApiScopeLedger.js';

import { ensureReadwiseApiCandidateIndex } from './readwiseApiCandidateFetch.js';
import { apiSettings, response } from './readwiseApiImportRun.testSupport.js';

const connection = 'connection';
const settings = apiSettings('off');
function run(fetchImpl: typeof fetch) {
  return ensureReadwiseApiCandidateIndex(settings, connection, { fetchImpl, minIntervalMs: 0 });
}
function ledger() {
  return loadReadwiseApiScopeLedgers(connection).find((item) => item.scope === 'reader:highlight');
}

it.each([
  {}, { results: {} }, { results: [] }, { results: [], nextPageCursor: false },
  { results: [], nextPageCursor: '' }, { results: [], nextPageCursor: 0 },
  { results: [], nextPageCursor: -1 }, { results: [], nextPageCursor: Number.MAX_SAFE_INTEGER + 1 }
])('rejects a malformed page without advancing its saved cursor: %j', async (bad) => {
  await expect(run(async (input) => new URL(String(input)).searchParams.has('pageCursor')
    ? Response.json(bad) : response([], 'saved'))).rejects.toThrow('readwise_api_page_invalid');
  expect(ledger()).toMatchObject({ checkpoint: null, cursor: 'saved', status: 'running' });
  const urls: URL[] = [];
  await run(async (input) => { urls.push(new URL(String(input))); return response([]); });
  expect(urls[0]?.searchParams.get('pageCursor')).toBe('saved');
  expect(ledger()).toMatchObject({ cursor: null, status: 'complete' });
});

it('continues empty numeric-cursor pages', async () => {
  const cursors: Array<string | null> = [];
  await run(async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get('category') !== 'highlight') return response([]);
    const cursor = url.searchParams.get('pageCursor');
    cursors.push(cursor);
    return Response.json({ results: [], nextPageCursor: cursor ? null : 123 });
  });
  expect(cursors).toEqual([null, '123']);
});

it.each([['A', 'A'], ['A', 'B', 'A']])('stops cursor cycles %j before writing their page', async (...cycle) => {
  let page = 0;
  await expect(run(async () => response([], cycle[page++] ?? null)))
    .rejects.toThrow('readwise_api_cursor_cycle');
  expect(page).toBe(cycle.length);
  expect(ledger()?.checkpoint).toBeNull();
});

it('recovers a persisted rejected cursor once, preserving the original checkpoint', async () => {
  await expect(run(async (input) => {
    if (new URL(String(input)).searchParams.has('pageCursor')) throw new Error('interrupted');
    return response([], 'expired');
  })).rejects.toThrow('interrupted');
  const original = ledger();
  const cursors: Array<string | null> = [];
  await run(async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get('category') !== 'highlight') return response([]);
    const cursor = url.searchParams.get('pageCursor');
    cursors.push(cursor);
    return cursor ? new Response('{}', { status: 400 }) : response([]);
  });
  expect(cursors).toEqual(['expired', null]);
  expect(ledger()).toMatchObject({ checkpoint: original?.checkpoint, runStartedAt: original?.runStartedAt,
    cursor: null, status: 'complete' });
});

it('fails a second cursor rejection instead of restarting forever', async () => {
  let requests = 0;
  await expect(run(async (input) => {
    requests += 1;
    return new URL(String(input)).searchParams.has('pageCursor')
      ? new Response('{}', { status: 400 }) : response([], 'expired');
  })).rejects.toThrow('readwise_api_http_400');
  expect(requests).toBe(4);
  expect(ledger()?.checkpoint).toBeNull();
});

it('retains a valid page across cancellation and resumes without duplicate records', async () => {
  await expect(run(async (input) => {
    if (new URL(String(input)).searchParams.has('pageCursor')) {
      throw new DOMException('Cancelled', 'AbortError');
    }
    return response([{ id: 'h1', category: 'article' }], 'resume');
  })).rejects.toThrow('Cancelled');
  expect(loadReadwiseApiReaderIndex(connection).map((item) => item.id)).toEqual(['h1']);
  await run(async () => response([{ id: 'h1', category: 'article' }]));
  expect(loadReadwiseApiReaderIndex(connection).map((item) => item.id)).toEqual(['h1']);
});
