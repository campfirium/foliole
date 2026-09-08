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

vi.mock('../database/attachments.js', () => ({
  createNodeAttachmentLink: vi.fn()
}));

import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

import { prepareReadwiseApiEpubImages } from './readwiseApiEpubImages.js';

beforeEach(() => {
  mocks.fetchRemoteImageResource.mockReset();
  mocks.importImageAttachmentResource.mockReset();
  mocks.fetchRemoteImageResource.mockImplementation(async (sourceUrl: string) => ({
    resource: {
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      originalName: `${new URL(sourceUrl).pathname.split('/').at(-1) ?? 'image'}.png`,
      sourceUrl
    },
    status: 'ready'
  }));
  mocks.importImageAttachmentResource.mockImplementation(async (input: { originalName: string }) => ({
    attachment_id: `attachment-${input.originalName}`,
    original_name: input.originalName,
    status: 'imported'
  }));
});

it('localizes the cover and body images while replacing unresolved references', async () => {
  const prepared = await prepareReadwiseApiEpubImages(documentFixture());

  expect(prepared).not.toBeNull();
  expect(prepared?.accounting).toEqual({
    conversionDroppedCount: 0,
    localizedBodyCount: 2,
    sourceBodyCount: 3,
    treeBodyCount: 3,
    unavailableBodyCount: 1
  });
  expect(prepared?.coverState).toBe('localized');
  expect(prepared?.rootBody).toContain('asset://attachment-cover.jpg.png');
  expect(prepared?.rootBody).toContain('asset://attachment-root.png.png');
  expect(prepared?.sections[0]?.content).toContain('asset://attachment-section.png.png');
  expect(prepared?.sections[0]?.content).toContain('**Image unavailable.**');
  expect(JSON.stringify(prepared)).not.toContain('https://');
  expect(JSON.stringify(prepared)).not.toContain('../images/missing.png');
  expect(prepared?.rootAttachmentIds).toEqual([
    'attachment-cover.jpg.png',
    'attachment-root.png.png'
  ]);
  expect(prepared?.sections[0]?.attachmentIds).toEqual(['attachment-section.png.png']);
  expect(mocks.fetchRemoteImageResource).toHaveBeenCalledTimes(3);
  expect(mocks.fetchRemoteImageResource).toHaveBeenCalledWith(expect.any(String), { bypassFailureCache: true });
});

function documentFixture(): PreparedReadwiseApiDocument {
  return {
    annotations: [],
    body: 'Reader body',
    category: 'epub',
    coverImageUrl: 'https://cdn.example.com/cover.jpg',
    degradedReason: null,
    epubStructure: {
      degradedReason: null,
      imageCount: 3,
      markerCount: 1,
      rootBody: '![](https://cdn.example.com/root.png)',
      sections: [{
        content: '![](https://cdn.example.com/section.png)\n\n![](../images/missing.png)',
        headingLevel: 1,
        markerKey: 'chapter',
        title: 'Chapter'
      }]
    },
    id: 'epub-1',
    metadata: { author: null, category: 'epub', readerUrl: null, sourceUrl: null, title: 'Book' },
    title: 'Book',
    unmatchedAnnotationCount: 0,
    updatedAt: '2026-09-08T00:00:00.000Z'
  };
}
