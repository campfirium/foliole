import { expect, it } from 'vitest';

import { resolveRenderablePageNumbers } from './pdfViewportPageNumbers';

const baseArgs = {
  highlightLocators: [],
  page: 1,
  pdfSelectionLocator: undefined,
  searchHighlights: [],
  searchQuery: '',
  totalPages: 12
};

it('renders a pending jump page outside the visible page window', () => {
  expect(resolveRenderablePageNumbers({ ...baseArgs, pendingPage: 10 })).toEqual([1, 2, 3, 10]);
});

it('ignores pending jump pages outside the document bounds', () => {
  expect(resolveRenderablePageNumbers({ ...baseArgs, pendingPage: 13 })).toEqual([1, 2, 3]);
});

it('keeps search and distant highlights out of the heavy page set unless the match is active', () => {
  expect(resolveRenderablePageNumbers({
    ...baseArgs,
    highlightLocators: [{ id: 'far-highlight', page: 12, x: null, y: null }],
    searchHighlights: [
      { id: 'inactive', isActive: false, page: 11, rects: [], x: null, y: null },
      { id: 'active', isActive: true, page: 10, rects: [], x: null, y: null }
    ],
    searchQuery: 'keyword'
  })).toEqual([1, 2, 3, 10]);
});
