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
    highlightState: 'pending',
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

it('builds placeholder content without creating workspace nodes', () => {
  expect(buildReadwiseBookPlaceholderContent(createBook())).toContain('Highlights available');
  expect(
    buildReadwiseBookPlaceholderContent(createBook({
      annotationStatus: 'no_highlights',
      epubStatus: 'received',
      importStatus: 'completed'
    }))
  ).toContain('Book import completed');
});
