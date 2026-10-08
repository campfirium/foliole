import type { PreparedReadwiseApiDocument } from '../../lib/core/readwise/readwiseApiImport.js';

export function epubFixture(): PreparedReadwiseApiDocument {
  return {
    annotations: [
      annotation('front', 'Front matter'),
      annotation('intro', 'Intro'),
      annotation('unique', 'Unique second excerpt'),
      annotation('ambiguous', 'Repeated excerpt')
    ],
    body: '# Chapter 6: Shape\n\nIntro\n\n## First section\n\nRepeated excerpt\n\n## Second section\n\nRepeated excerpt\n\nUnique second excerpt',
    category: 'epub',
    coverImageUrl: null,
    degradedReason: null,
    epubStructure: {
      degradedReason: null,
      imageCount: 0,
      markerCount: 3,
      rootBody: 'Front matter',
      sections: [
        { content: '# Chapter 6: Shape\n\nIntro', headingLevel: 1, markerKey: 'chapter', title: 'Chapter 6: Shape' },
        { content: '## First section\n\nRepeated excerpt\n\nRepeated excerpt', headingLevel: 2, markerKey: 'first', title: 'First section' },
        { content: '## Second section\n\nRepeated excerpt\n\nUnique second excerpt', headingLevel: 2, markerKey: 'second', title: 'Second section' }
      ]
    },
    id: 'epub-1',
    metadata: { author: null, category: 'epub', readerUrl: null, sourceUrl: null, title: 'Book' },
    title: 'Book', unmatchedAnnotationCount: 0, updatedAt: '2026-09-08T00:00:00.000Z'
  };
}

export function annotation(remoteId: string, text: string) {
  return {
    content: text, contentHash: remoteId, kind: 'highlight' as const, locatorText: text,
    parentRemoteId: 'epub-1', remoteId, updatedAt: '2026-09-08T00:00:00.000Z'
  };
}
