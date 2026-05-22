// @vitest-environment node

import { expect, it } from 'vitest';

import {
  buildReadwiseBookPlaceholderContent,
  buildReadwiseBookPlaceholderNodeId
} from './readwiseBookNodes.js';
import type { ReadwiseBookInventoryItem } from './readwiseBooksInventory.js';

function createBook(overrides: Partial<ReadwiseBookInventoryItem> = {}): ReadwiseBookInventoryItem {
  return {
    annotationStatus: 'has_highlights',
    bodyState: 'unloaded',
    bookKey: 'annotated book',
    downloadUrl: null,
    epubPath: null,
    epubStatus: 'missing',
    fullDocumentMarkdownPath: '/Readwise/Full Document Contents/Books/Annotated Book.md',
    generatedNodeId: null,
    highlightCount: 2,
    highlightState: 'pending',
    highlights: [
      { note: null, text: 'First searchable highlight.' },
      { note: null, text: 'Second searchable highlight.' }
    ],
    highlightMarkdownPath: '/Readwise/Books/Annotated Book.md',
    highlightUnmatchedCount: null,
    importStatus: 'pending',
    nodeStatus: 'missing',
    title: 'Annotated Book',
    ...overrides
  };
}

it('builds stable readwise book placeholder ids for explicit book actions', () => {
  expect(buildReadwiseBookPlaceholderNodeId('Annotated Book')).toBe(
    buildReadwiseBookPlaceholderNodeId('Annotated Book')
  );
  expect(buildReadwiseBookPlaceholderNodeId('Annotated Book')).toMatch(/^node-readwise-book-[a-f0-9]{24}$/u);
});

it('builds pending book content as a Readwise original file placeholder', () => {
  const content = buildReadwiseBookPlaceholderContent(createBook({
    downloadUrl: 'https://readwise.io/reader/document_raw_content/42'
  }));

  expect(content).toBe([
    '# Annotated Book',
    '',
    'Full text of this document omitted because this document is an EPUB',
    '',
    '[Download original file ->](https://readwise.io/reader/document_raw_content/42)',
    '',
    '## Highlights',
    '2 highlights',
    '',
    '- First searchable highlight.',
    '',
    '- Second searchable highlight.'
  ].join('\n'));
});

it('builds completed placeholder status content without creating workspace nodes', () => {
  expect(buildReadwiseBookPlaceholderContent(createBook({ importStatus: 'completed' }))).toContain('Highlights available');
  expect(
    buildReadwiseBookPlaceholderContent(createBook({
      annotationStatus: 'no_highlights',
      epubStatus: 'received',
      importStatus: 'completed'
    }))
  ).toContain('Book import completed');
  expect(buildReadwiseBookPlaceholderContent(createBook({ importStatus: 'completed' }))).toContain('Load original file');
});
