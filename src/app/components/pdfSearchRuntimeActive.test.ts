import { describe, expect, it } from 'vitest';

import { isPdfSearchRuntimeActive } from './pdfSearchRuntimeActive';

describe('isPdfSearchRuntimeActive', () => {
  it('stays inactive when there is no query, request, or target', () => {
    expect(isPdfSearchRuntimeActive({ searchQuery: '   ', searchRequest: null, searchTarget: null })).toBe(false);
  });

  it('becomes active when any search driver is present', () => {
    expect(isPdfSearchRuntimeActive({ searchQuery: 'keyword', searchRequest: null, searchTarget: null })).toBe(true);
    expect(isPdfSearchRuntimeActive({ searchQuery: '   ', searchRequest: { direction: 'next', id: 1 }, searchTarget: null })).toBe(true);
    expect(isPdfSearchRuntimeActive({ searchQuery: '   ', searchRequest: null, searchTarget: { id: 2, matchStart: 10, page: 1 } })).toBe(true);
  });

  it('treats later query activation as active even if the page was opened idle', () => {
    const openedIdle = isPdfSearchRuntimeActive({ searchQuery: '   ', searchRequest: null, searchTarget: null });
    const startedSearchLater = isPdfSearchRuntimeActive({ searchQuery: 'keyword', searchRequest: null, searchTarget: null });

    expect(openedIdle).toBe(false);
    expect(startedSearchLater).toBe(true);
  });
});
