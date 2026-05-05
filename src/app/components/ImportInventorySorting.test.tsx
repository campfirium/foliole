import { expect, it } from 'vitest';

import type { RuntimePdfImportsInventory } from '../../shared/platform/pdfImportsBridge';
import type { RuntimeReadwiseBooksInventory } from '../../shared/platform/readwiseBooksBridge';

import { sortOverviewItems } from './importOverviewSorting';
import { filterPdfInventory, sortPdfItems } from './ImportSourceWorkspacePdfPage';
import { filterBooksInventory, sortBooks } from './ImportSourceWorkspaceReadwiseBooksPage';

it('filters and sorts books for the Readwise Books panel', () => {
  const inventory: RuntimeReadwiseBooksInventory = {
    books: [
      {
        annotationStatus: 'has_highlights',
        bookKey: 'book-z',
        epubPath: '/tmp/Zebra.epub',
        epubStatus: 'received',
        fullDocumentMarkdownPath: '/tmp/Zebra.md',
        generatedNodeId: 'node-z',
        highlightMarkdownPath: '/tmp/Zebra Highlights.md',
        importStatus: 'completed',
        nodeStatus: 'generated',
        title: 'Zebra Book'
      },
      {
        annotationStatus: 'no_highlights',
        bookKey: 'book-a',
        epubPath: '/tmp/Alpha.epub',
        epubStatus: 'received',
        fullDocumentMarkdownPath: '/tmp/Alpha.md',
        generatedNodeId: null,
        highlightMarkdownPath: '/tmp/Alpha Highlights.md',
        importStatus: 'pending',
        nodeStatus: 'missing',
        title: 'Alpha Book'
      }
    ],
    fullDocumentDirectoryPath: '/tmp/books',
    highlightDirectoryPath: '/tmp/highlights',
    scannedAt: '2026-04-03T10:00:00.000Z'
  };

  expect(filterBooksInventory('alpha', inventory)?.books.map((book) => book.title)).toEqual(['Alpha Book']);
  expect(sortBooks(inventory.books, 'title', 'desc', { scannedAt: inventory.scannedAt }).map((book) => book.title)).toEqual(['Zebra Book', 'Alpha Book']);
});

it('filters and sorts PDFs for the PDF panel', () => {
  const inventory: RuntimePdfImportsInventory = {
    items: [
      {
        lastImportedAt: '2026-04-04T01:00:00.000Z',
        latestNodeId: 'node-z',
        nodeStatus: 'generated',
        pdfIndexedAt: '2026-04-04T01:05:00.000Z',
        pdfIndexStatus: 'ready',
        sourceFingerprint: 'pdf-z',
        sourceLocator: '/tmp/Zebra.pdf',
        sourceName: 'Zebra.pdf'
      },
      {
        lastImportedAt: '2026-04-04T02:00:00.000Z',
        latestNodeId: 'node-a',
        nodeStatus: 'generated',
        pdfIndexedAt: '2026-04-04T02:05:00.000Z',
        pdfIndexStatus: 'ready',
        sourceFingerprint: 'pdf-a',
        sourceLocator: '/tmp/Alpha.pdf',
        sourceName: 'Alpha.pdf'
      }
    ],
    scannedAt: '2026-04-04T02:06:00.000Z'
  };

  expect(filterPdfInventory('alpha', inventory)?.items.map((item) => item.sourceName)).toEqual(['Alpha.pdf']);
  expect(sortPdfItems(inventory.items, 'title', 'asc').map((item) => item.sourceName)).toEqual(['Alpha.pdf', 'Zebra.pdf']);
});

it('sorts the combined imports data by title when requested', () => {
  const sorted = sortOverviewItems(
    [
      { sortLastOpened: null, sortSaved: '2026-04-03T10:00:00.000Z', sortTitle: 'Zebra Book' },
      { sortLastOpened: null, sortSaved: '2026-04-04T01:00:00.000Z', sortTitle: 'Alpha PDF' },
      { sortLastOpened: null, sortSaved: '2026-04-05T01:00:00.000Z', sortTitle: 'Essay note' }
    ],
    'title',
    'asc'
  );

  expect(sorted.map((item) => item.sortTitle)).toEqual(['Alpha PDF', 'Essay note', 'Zebra Book']);
});
