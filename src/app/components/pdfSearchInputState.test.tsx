import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePdfSearchInputState } from './pdfSearchInputState';

describe('usePdfSearchInputState', () => {
  it('keeps a composing draft when an external search query arrives', () => {
    const onSearchQueryChange = vi.fn();
    const onToolbarInteraction = vi.fn();
    const { result, rerender } = renderHook(
      ({ searchQuery }) =>
        usePdfSearchInputState({
          onSearchQueryChange,
          onToolbarInteraction,
          searchQuery
        }),
      {
        initialProps: { searchQuery: 'ce' }
      }
    );

    act(() => {
      result.current.handleSearchCompositionStart();
    });
    act(() => {
      result.current.handleSearchInputChange({
        target: { value: 'ceshi' },
        nativeEvent: { isComposing: true }
      } as never);
    });

    expect(result.current.draftQuery).toBe('ceshi');

    rerender({ searchQuery: '测试' });

    expect(result.current.draftQuery).toBe('ceshi');
    expect(onSearchQueryChange).not.toHaveBeenCalled();

    act(() => {
      result.current.handleSearchCompositionEnd({
        currentTarget: { value: '测试' }
      } as never);
    });

    expect(result.current.draftQuery).toBe('测试');
    expect(onSearchQueryChange).toHaveBeenCalledWith('测试');
  });
});
