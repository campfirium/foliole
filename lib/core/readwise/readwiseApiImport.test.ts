// @vitest-environment node

import { expect, it } from 'vitest';

import { normalizeExportBook, normalizeReaderDocument } from './readwiseApiContract.js';
import { prepareReadwiseApiDocuments, stableReadwiseAnnotationNodeId } from './readwiseApiImport.js';

it('normalizes readable bodies and only materializes export-verified annotations', () => {
  const documents = [
    { author: 'Author', category: 'article', html_content: '<h1>Heading</h1><p>Body</p>', id: 'doc', title: 'Title' },
    { category: 'highlight', id: 'highlight', parent_id: 'doc' },
    { category: 'note', id: 'note', parent_id: 'highlight' },
    { category: 'highlight', html_content: '<p>Unverified</p>', id: 'other', parent_id: 'doc' }
  ].map(normalizeReaderDocument).filter((item) => item !== null);
  const exported = [normalizeExportBook({
    external_id: 'doc', highlights: [{
      external_id: 'highlight', note: 'Comment', text: 'Body', updated_at: '2026-09-08T00:00:00Z'
    }], source: 'reader', user_book_id: 1
  })!];

  expect(prepareReadwiseApiDocuments(documents, exported)).toMatchObject([{
    annotations: [
      { content: expect.stringContaining('Comment'), kind: 'highlight', remoteId: 'highlight' }
    ],
    body: '# Heading\n\nBody',
    id: 'doc',
    title: 'Title'
  }]);
});

it('rejects a highlight whose Export book and Reader ancestry disagree', () => {
  const documents = [
    { category: 'article', html_content: '<p>Body</p>', id: 'doc' },
    { category: 'highlight', id: 'highlight', parent_id: 'doc' }
  ].map(normalizeReaderDocument).filter((item) => item !== null);
  const exported = [normalizeExportBook({
    external_id: 'other-doc', highlights: [{ external_id: 'highlight', text: 'Body' }],
    source: 'reader', user_book_id: 1
  })!];

  expect(prepareReadwiseApiDocuments(documents, exported)[0]).toMatchObject({
    annotations: [], unmatchedAnnotationCount: 1
  });
});

it('fails closed instead of producing a metadata-only topic', () => {
  const document = normalizeReaderDocument({ category: 'video', id: 'video', title: 'Metadata only' })!;
  expect(prepareReadwiseApiDocuments([document], [])[0]).toMatchObject({
    body: '',
    degradedReason: 'Readable body is unavailable; this source was not imported.'
  });
});

it('derives stable annotation node ids from connection and remote identity', () => {
  expect(stableReadwiseAnnotationNodeId('connection', 'highlight')).toBe(
    stableReadwiseAnnotationNodeId('connection', 'highlight')
  );
  expect(stableReadwiseAnnotationNodeId('connection', 'highlight')).not.toBe(
    stableReadwiseAnnotationNodeId('other', 'highlight')
  );
});
