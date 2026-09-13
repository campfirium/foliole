// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchRemoteImageResource: vi.fn(),
  importImageAttachmentResource: vi.fn()
}));

vi.mock('../attachments/remoteImagePipeline.js', () => ({
  fetchRemoteImageResource: mocks.fetchRemoteImageResource
}));

vi.mock('../attachments/importImageAttachmentResource.js', () => ({
  importImageAttachmentResource: mocks.importImageAttachmentResource
}));

import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

import { prepareReadwiseApiEpubCover } from './readwiseApiEpubCover.js';

beforeEach(() => {
  mocks.fetchRemoteImageResource.mockReset();
  mocks.importImageAttachmentResource.mockReset();
  mocks.fetchRemoteImageResource.mockResolvedValue({
    resource: {
      bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg',
      originalName: 'cover.jpeg', sourceUrl: 'https://cdn.example.com/cover.jpeg'
    },
    status: 'ready'
  });
  mocks.importImageAttachmentResource.mockResolvedValue({
    attachment_id: 'cover-attachment', hash: 'a'.repeat(64), mime_type: 'image/jpeg',
    original_name: 'cover.jpeg', status: 'imported', storage_key: `${'a'.repeat(64)}.jpg`
  });
});

it('localizes the top-level API cover without reading EPUB HTML images', async () => {
  const result = await prepareReadwiseApiEpubCover(documentFixture());

  expect(result).toEqual({
    attachmentIds: ['cover-attachment'], degradedReason: null,
    text: `![Book cover](asset://${'a'.repeat(64)}.jpg)`
  });
  expect(mocks.fetchRemoteImageResource).toHaveBeenCalledOnce();
});

it('does not fabricate a cover when the API omits imageUrl', async () => {
  const result = await prepareReadwiseApiEpubCover({ ...documentFixture(), coverImageUrl: null });

  expect(result).toEqual({ attachmentIds: [], degradedReason: null, text: '' });
  expect(mocks.fetchRemoteImageResource).not.toHaveBeenCalled();
});

function documentFixture(): PreparedReadwiseApiDocument {
  return {
    annotations: [], body: 'Reader body', category: 'epub',
    coverImageUrl: 'https://cdn.example.com/cover.jpeg', degradedReason: null,
    epubStructure: null, id: 'epub-1',
    metadata: { author: null, category: 'epub', readerUrl: null, sourceUrl: null, title: 'Book' },
    title: 'Book', unmatchedAnnotationCount: 0, updatedAt: null
  };
}
