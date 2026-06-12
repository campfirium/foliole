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
