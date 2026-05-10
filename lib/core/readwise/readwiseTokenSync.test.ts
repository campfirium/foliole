import { expect, it } from 'vitest';

import { normalizeReadwiseTokenSyncBatch } from './readwiseTokenSync.js';

it('normalizes Reader library documents and skips feed entries', () => {
  const normalized = normalizeReadwiseTokenSyncBatch({
    documents: [
      {
        author: 'Reader author',
        category: 'article',
        id: 'reader-doc-1',
        location: 'new',
        source_url: 'https://example.com/a',
        tags: ['tag-a'],
        title: 'Reader article',
        updated_at: '2026-05-10T00:00:00Z'
      },
      { id: 'reader-feed-1', location: 'feed', title: 'RSS entry' }
    ],
    exportBooks: [{
      highlights: [{ id: 'highlight-1', text: 'Quote', updated_at: '2026-05-10T00:01:00Z' }],
      id: 'book-1',
      source_url: 'https://example.com/a',
      title: 'Reader article'
    }],
    fetchedAt: '2026-05-10T00:02:00Z',
    nextPageCursor: null
  });

  expect(normalized.sources).toHaveLength(1);
  expect(normalized.sources[0]).toMatchObject({
    annotations: [{ highlightId: 'highlight-1', readwiseBookId: 'book-1', text: 'Quote' }],
    readerDocumentId: 'reader-doc-1',
    readwiseBookId: 'book-1',
    sourceUrl: 'https://example.com/a',
    syncStatus: 'synced'
  });
});
