// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchRemoteImageResource: vi.fn(),
  saveReadwiseApiFrozenResources: vi.fn()
}));

vi.mock('../attachments/remoteImagePipeline.js', () => ({
  fetchRemoteImageResource: mocks.fetchRemoteImageResource
}));

vi.mock('../database/readwiseApiFrozenResourceStage.js', () => ({
  saveReadwiseApiFrozenResources: mocks.saveReadwiseApiFrozenResources
}));

import { createDefaultReadwiseReaderConfig } from '../../lib/core/import/readwiseReaderSettings.js';
import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

import { prepareReadwiseCutoverResources } from './readwiseSourceCutoverDocumentStep.js';

beforeEach(() => {
  mocks.fetchRemoteImageResource.mockReset();
  mocks.saveReadwiseApiFrozenResources.mockReset();
});

it('defers every EPUB image while freezing cutover resources', async () => {
  const result = await prepareReadwiseCutoverResources({
    config: createDefaultReadwiseReaderConfig(),
    connectionRef: 'connection',
    destination: 'inbox',
    document: documentFixture(),
    rebuildBook: true
  });

  expect(result).toEqual({
    cutoverBodySource: 'reader_html',
    epubCover: {
      attachmentIds: [],
      degradedReason: null,
      text: '![Book cover](https://s3.example.com/cover.jpeg)'
    },
    epubImages: null,
    forceEpubStructure: true,
    originalFile: null
  });
  expect(mocks.fetchRemoteImageResource).not.toHaveBeenCalled();
  expect(mocks.saveReadwiseApiFrozenResources).toHaveBeenCalledWith(
    'connection', 'epub-1', result
  );
});

function documentFixture(): PreparedReadwiseApiDocument {
  return {
    annotations: [],
    body: 'Before\n\n![Diagram](https://s3.example.com/diagram.png)\n\nAfter',
    category: 'epub',
    coverImageUrl: 'https://s3.example.com/cover.jpeg',
    degradedReason: null,
    epubStructure: null,
    id: 'epub-1',
    metadata: {
      author: null, category: 'epub', readerUrl: null, sourceUrl: null, title: 'Book'
    },
    title: 'Book',
    unmatchedAnnotationCount: 0,
    updatedAt: null
  };
}
