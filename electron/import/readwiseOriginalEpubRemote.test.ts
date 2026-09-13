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
  fetchOriginalEpubRemoteRoot
} from './readwiseOriginalEpubRemote.js';

beforeEach(() => {
  request.mockReset();
  createRequest.mockReset();
  createRequest.mockReturnValue(request);
});

it('fetches only the target document needed to obtain the original EPUB URL', async () => {
  request.mockResolvedValue({ results: [{
    category: 'epub', html_content: '<p>Reader body</p>', id: 'book-1',
    raw_source_url: 'https://bucket.s3.amazonaws.com/book.epub', title: 'Book'
  }] });

  const remote = await fetchOriginalEpubRemoteRoot({ documentId: 'book-1' });
  expect(remote.rawSourceUrl).toContain('book.epub');
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]?.[0].searchParams.get('id')).toBe('book-1');
  expect(request.mock.calls[0]?.[0].searchParams.has('withHtmlContent')).toBe(false);
  expect(request.mock.calls[0]?.[0].searchParams.get('withRawSourceUrl')).toBe('true');
});
