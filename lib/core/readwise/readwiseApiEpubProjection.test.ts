// @vitest-environment node

import { expect, it } from 'vitest';

import {
  createReadwiseApiEpubProjectionProof,
  matchesReadwiseApiEpubProjection,
  requiresReadwiseApiEpubProjection
} from './readwiseApiEpubProjection.js';
import type { PreparedReadwiseApiDocument } from './readwiseApiImport.js';

it('binds a projection proof to the production structure source', () => {
  const document = epubDocument();
  const proof = createReadwiseApiEpubProjectionProof(document);

  expect(proof).toMatchObject({ sourceHash: expect.stringMatching(/^[0-9a-f]{64}$/u), version: 1 });
  expect(matchesReadwiseApiEpubProjection(proof, document)).toBe(true);
  expect(matchesReadwiseApiEpubProjection(proof, {
    ...document,
    epubStructure: {
      ...document.epubStructure!,
      sections: [{ ...document.epubStructure!.sections[0]!, content: 'Changed' }]
    }
  })).toBe(false);
  expect(requiresReadwiseApiEpubProjection(null, document, true)).toBe(true);
  expect(requiresReadwiseApiEpubProjection(proof, document, true)).toBe(false);
});

function epubDocument(): PreparedReadwiseApiDocument {
  return {
    annotations: [], body: 'Body', category: 'epub', coverImageUrl: null,
    degradedReason: null,
    epubStructure: {
      degradedReason: null, imageCount: 0, markerCount: 1, rootBody: 'Root',
      sections: [{ content: 'Body', headingLevel: 1, markerKey: 'chapter', title: 'Chapter' }]
    },
    id: 'book', metadata: {
      author: null, category: 'epub', readerUrl: null, sourceUrl: null, title: 'Book'
    },
    title: 'Book', unmatchedAnnotationCount: 0, updatedAt: null
  };
}
