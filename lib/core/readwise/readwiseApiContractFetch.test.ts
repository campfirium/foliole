// @vitest-environment node

import { expect, it, vi } from 'vitest';

import {
  fetchReadwiseContract,
  summarizeFetchedContract
} from '../../../scripts/oneoff/readwise-api-contract-fetch.js';

it('collects every Reader and Export page before calculating identity joins', async () => {
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const isExport = url.pathname.includes('/v2/export/');
    const cursor = url.searchParams.get('pageCursor');
    const body = isExport
      ? cursor
        ? { nextPageCursor: null, results: [{ external_id: 'doc-2', highlights: [], source: 'reader', user_book_id: 2 }] }
        : { nextPageCursor: 'export-2', results: [{ external_id: 'doc-1', highlights: [], source: 'reader', user_book_id: 1 }] }
      : cursor
        ? { nextPageCursor: null, results: [{ category: 'rss', html_content: '<p>Two</p>', id: 'doc-2' }] }
        : { nextPageCursor: 'reader-2', results: [{ category: 'article', html_content: '<p>One</p>', id: 'doc-1' }] };
    return new Response(JSON.stringify(body), { status: 200 });
  });

  const contract = await fetchReadwiseContract('SENTINEL-TOKEN', { fetchImpl, minIntervalMs: 0 });
  const summary = summarizeFetchedContract(contract);

  expect(fetchImpl).toHaveBeenCalledTimes(4);
  expect(summary.export).toMatchObject({ readerBookCount: 2, readerDocumentJoinCount: 2, totalBooks: 2 });
  expect(JSON.stringify(summary)).not.toContain('SENTINEL-TOKEN');
  expect(JSON.stringify(summary)).not.toContain('<p>One</p>');
});

it('rejects a failed page instead of treating partial results as complete', async () => {
  const fetchImpl = vi.fn(async () => new Response('{}', { headers: { 'Retry-After': '4' }, status: 429 }));
  await expect(fetchReadwiseContract('secret', { fetchImpl, minIntervalMs: 0 }))
    .rejects.toThrow('readwise_http_429_retry_after_4');
});
