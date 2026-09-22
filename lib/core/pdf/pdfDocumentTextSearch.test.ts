import { expect, it } from 'vitest';

import { searchPdfDocumentText } from './pdfDocumentTextSearch.js';

it('returns every ordered page match without requiring rendered pages', () => {
  expect(searchPdfDocumentText([
    { page: 2, text: 'keyword then keyword' },
    { page: 1, text: 'first key word' }
  ], 'keyword')).toEqual([
    expect.objectContaining({ matchStart: 6, page: 1 }),
    expect.objectContaining({ matchStart: 0, page: 2 }),
    expect.objectContaining({ matchStart: 13, page: 2 })
  ]);
});

it('returns a cross-page match with exact fragments', () => {
  expect(searchPdfDocumentText([
    { page: 1, text: 'alpha bri' },
    { page: 2, text: 'dge omega' }
  ], 'bridge')).toEqual([{
    fragments: [{ end: 9, page: 1, start: 6 }, { end: 3, page: 2, start: 0 }],
    id: 'cross:1-2:6:0',
    matchStart: 6,
    page: 1
  }]);
});
