// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

import { normalizeReadwiseApiDocumentImportState } from '../../lib/core/readwise/readwiseApiImportState.js';

const mocks = vi.hoisted(() => ({
  cover: vi.fn(),
  images: vi.fn(),
  merge: vi.fn(),
  request: vi.fn()
}));

vi.mock('./readwiseApiEpubCover.js', () => ({ prepareReadwiseApiEpubCover: mocks.cover }));
vi.mock('./readwiseApiEpubImages.js', () => ({ prepareReadwiseApiEpubImages: mocks.images }));
vi.mock('./readwiseApiImportFetch.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./readwiseApiImportFetch.js')>();
  return { ...original, createReadwiseApiRequest: () => mocks.request };
});
vi.mock('./readwiseOriginalEpubAnnotations.js', () => ({ mergeRetainedReadwiseAnnotations: mocks.merge }));

import { prepareReadwiseSourceResync } from './readwiseSourceResyncPreparation.js';

const target = {
  connectionRef: 'connection', documentId: 'document-1', nodeId: 'source', sourceFingerprint: 'fingerprint',
  state: normalizeReadwiseApiDocumentImportState({ metadata: { category: 'article' } }), title: 'Source'
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.merge.mockImplementation((_target, annotations) => annotations);
  mocks.cover.mockResolvedValue({ attachmentIds: [], degradedReason: null, text: '' });
  mocks.images.mockResolvedValue(null);
});

it('requests only the selected Reader document with its current body on every preparation', async () => {
  mocks.request.mockResolvedValue({ results: [readerDocument('article', '<p>Current body.</p>')] });

  await expect(prepareReadwiseSourceResync(target, { minIntervalMs: 0 }))
    .resolves.toMatchObject({ document: { body: 'Current body.', id: 'document-1' } });
  await prepareReadwiseSourceResync(target, { minIntervalMs: 0 });

  expect(mocks.request).toHaveBeenCalledTimes(2);
  const requested = mocks.request.mock.calls[0]?.[0] as URL;
  expect(requested.origin + requested.pathname).toBe('https://readwise.io/api/v3/list/');
  expect(requested.searchParams.get('id')).toBe('document-1');
  expect(requested.searchParams.get('withHtmlContent')).toBe('true');
  expect([...requested.searchParams.keys()]).toEqual(['id', 'withHtmlContent']);
});

it('rejects unavailable bodies before any commit candidate exists', async () => {
  mocks.request.mockResolvedValue({ results: [readerDocument('article', '')] });
  await expect(prepareReadwiseSourceResync(target)).rejects.toThrow('readwise_resync_body_unavailable');
});

it('requires a complete EPUB resource candidate', async () => {
  mocks.request.mockResolvedValue({
    results: [readerDocument('epub', '<h1 data-rw-epub-toc="chapter">Chapter</h1><p>Body.</p>')]
  });
  mocks.images.mockResolvedValue({ degradedReason: 'image failed' });
  await expect(prepareReadwiseSourceResync(target)).rejects
    .toThrow('readwise_resync_epub_resources_incomplete');
});

function readerDocument(category: string, htmlContent: string) {
  return {
    author: null, category, html_content: htmlContent, id: 'document-1', image_url: null,
    parent_id: null, source_url: null, title: 'Source', updated_at: '2026-09-13T00:00:00.000Z',
    url: 'https://readwise.io/reader/read/document-1'
  };
}
