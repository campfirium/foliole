// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
const createRequest = vi.hoisted(() => vi.fn());
vi.mock('./readwiseApiImportFetch.js', () => ({
  createReadwiseApiRequest: createRequest,
  READWISE_EXPORT_URL: 'https://readwise.io/api/v2/export/',
  READWISE_READER_LIST_URL: 'https://readwise.io/api/v3/list/'
}));

import {
  fetchOriginalEpubRemoteAnnotations,
  fetchOriginalEpubRemoteRoot
} from './readwiseOriginalEpubRemote.js';

beforeEach(() => {
  request.mockReset();
  createRequest.mockReset();
  createRequest.mockReturnValue(request);
});

it('fetches the target URL separately, then completes every annotation identity page', async () => {
  request.mockImplementation(async (url: URL) => {
    const cursor = url.searchParams.get('pageCursor');
    if (url.searchParams.get('id') === 'book-1') {
      return { results: [{
        category: 'epub', html_content: '<p>Reader body</p>', id: 'book-1',
        raw_source_url: 'https://bucket.s3.amazonaws.com/book.epub', title: 'Book'
      }] };
    }
    if (url.pathname === '/api/v2/export/') {
      return cursor ? {
        nextPageCursor: null,
        results: [{ external_id: 'other-book', highlights: [], source: 'reader' }]
      } : {
        nextPageCursor: 'export-2',
        results: [{
          external_id: 'book-1', highlights: [{ external_id: 'highlight-1', text: 'Remember me' }], source: 'reader'
        }]
      };
    }
    if (url.searchParams.get('category') === 'highlight') {
      return cursor ? {
        nextPageCursor: null,
        results: [{ category: 'highlight', id: 'other-highlight', parent_id: 'other-book' }]
      } : {
        nextPageCursor: 'highlight-2',
        results: [{ category: 'highlight', id: 'highlight-1', parent_id: 'book-1' }]
      };
    }
    return { nextPageCursor: null, results: [] };
  });
  const onPage = vi.fn();

  const remote = await fetchOriginalEpubRemoteRoot({ documentId: 'book-1' });
  expect(remote.rawSourceUrl).toContain('book.epub');
  await expect(fetchOriginalEpubRemoteAnnotations({
    documentId: 'book-1', onPage, root: remote.root
  })).resolves.toMatchObject({
    annotations: [{ content: 'Remember me', remoteId: 'highlight-1' }], id: 'book-1', unmatchedAnnotationCount: 0
  });
  expect(request.mock.calls.filter(([url]) => (url as URL).searchParams.get('pageCursor'))).toHaveLength(2);
  expect(onPage).toHaveBeenCalledTimes(5);
});

it('rejects partial identity joins instead of silently dropping a known target highlight', async () => {
  request.mockImplementation(async (url: URL) => {
    if (url.pathname === '/api/v2/export/') return { results: [] };
    if (url.searchParams.get('category') === 'highlight') {
      return { results: [{ category: 'highlight', id: 'highlight-1', parent_id: 'book-1' }] };
    }
    return { results: [] };
  });
  const root = {
    author: null, category: 'epub' as const, htmlContent: '<p>Body</p>', id: 'book-1', imageUrl: null,
    notes: null, parentId: null, rawSourceUrl: null, sourceUrl: null, summary: null, title: 'Book', updatedAt: null, url: null
  };

  await expect(fetchOriginalEpubRemoteAnnotations({ documentId: 'book-1', root }))
    .rejects.toThrow('original_epub_highlights_incomplete');
});
