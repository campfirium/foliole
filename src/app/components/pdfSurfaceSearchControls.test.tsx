import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePdfSearchControls } from './pdfSurfaceSearchControls';

describe('usePdfSearchControls', () => {
  it('clears stale search request and target when query changes', () => {
    const { result } = renderHook(() => usePdfSearchControls());

    act(() => {
      result.current.handleSearchRequest('next');
    });
    act(() => {
      result.current.applyExternalSearch({ matchStart: 8, page: 2, query: 'alpha' });
    });

    expect(result.current.searchRequest).toBeNull();
    expect(result.current.searchTarget).not.toBeNull();

    act(() => {
      result.current.handleSearchRequest('previous');
    });
    act(() => {
      result.current.handleSearchQueryChange('beta');
    });

    expect(result.current.searchQuery).toBe('beta');
    expect(result.current.searchRequest).toBeNull();
    expect(result.current.searchTarget).toBeNull();
  });
});
