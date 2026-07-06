import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useImmersiveReadableArticleState } from './useImmersiveReadableArticleState';

function clickEvent(target: Element) {
  return { target } as unknown as Parameters<ReturnType<typeof useImmersiveReadableArticleState>['handleSurfaceClick']>[0];
}

describe('useImmersiveReadableArticleState', () => {
  it('starts with chrome hidden and toggles it from ordinary article taps', () => {
    const { result } = renderHook(() => useImmersiveReadableArticleState());
    const paragraph = document.createElement('p');

    expect(result.current.isChromeVisible).toBe(false);

    act(() => result.current.handleSurfaceClick(clickEvent(paragraph)));
    expect(result.current.isChromeVisible).toBe(true);

    act(() => result.current.handleSurfaceClick(clickEvent(paragraph)));
    expect(result.current.isChromeVisible).toBe(false);
  });

  it('does not toggle chrome from interactive controls', () => {
    const { result } = renderHook(() => useImmersiveReadableArticleState());
    const button = document.createElement('button');

    act(() => result.current.handleSurfaceClick(clickEvent(button)));

    expect(result.current.isChromeVisible).toBe(false);
  });
});