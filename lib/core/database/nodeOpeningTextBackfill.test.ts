import { expect, it } from 'vitest';

import { resolveBackfilledNodeOpeningTextById } from './nodeOpeningTextBackfill.js';

it('backfills direct body, pdf, and the first nested child opening_text in node order', () => {
  const openingTextById = resolveBackfilledNodeOpeningTextById({
    nodeOrderRows: [
      { node_id: 'node-book' },
      { node_id: 'node-title-page' },
      { node_id: 'node-part' },
      { node_id: 'node-chapter' },
      { node_id: 'node-pdf' }
    ],
    nodeRows: [
      {
        content: '# Book Title\n\n![Cover](asset://cover.png)',
        id: 'node-book',
        kind: 'topic',
        parent_id: null,
        title: 'Book Title'
      },
      {
        content: '# Title Page\n\nBook Title',
        id: 'node-title-page',
        kind: 'topic',
        parent_id: 'node-book',
        title: 'Title Page'
      },
      {
        content: '**Part One**',
        id: 'node-part',
        kind: 'topic',
        parent_id: 'node-book',
        title: 'Part One'
      },
      {
        content: '# Chapter 1\n\nThe first real chapter body.',
        id: 'node-chapter',
        kind: 'topic',
        parent_id: 'node-part',
        title: 'Chapter 1'
      },
      {
        content: '# PDF\n\nLinked PDF source ready for the reader surface.',
        id: 'node-pdf',
        kind: 'topic',
        parent_id: null,
        title: 'PDF'
      }
    ],
    pdfOpeningRows: [{ node_id: 'node-pdf', text: 'The actual PDF body starts here.' }]
  });

  expect(openingTextById.get('node-book')).toBe('The first real chapter body.');
  expect(openingTextById.get('node-title-page')).toBe('Book Title');
  expect(openingTextById.get('node-part')).toBe('Part One');
  expect(openingTextById.get('node-chapter')).toBe('The first real chapter body.');
  expect(openingTextById.get('node-pdf')).toBe('The actual PDF body starts here.');
});
