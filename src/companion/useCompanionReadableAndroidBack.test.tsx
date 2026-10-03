import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { dispatchCompanionAndroidBack } from './companionAndroidBackEvent';
import { useCompanionReadableAndroidBack } from './useCompanionReadableAndroidBack';

describe('readable article system Back', () => {
  it('closes selection before the article without changing review progress', () => {
    const closeSelection = vi.fn();
    const exit = vi.fn();
    const finishEditing = vi.fn(async () => undefined);
    const args = { closeSelection, editing: false, exit, finishEditing, selectionOpen: true };
    const { rerender } = renderHook(() => useCompanionReadableAndroidBack(args));
    act(() => { expect(dispatchCompanionAndroidBack()).toBe(true); });
    expect(closeSelection).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    args.selectionOpen = false;
    rerender();
    act(() => { expect(dispatchCompanionAndroidBack()).toBe(true); });
    expect(exit).toHaveBeenCalledOnce();
  });

  it('finishes editing before navigating away', () => {
    const finishEditing = vi.fn(async () => undefined);
    const exit = vi.fn();
    renderHook(() => useCompanionReadableAndroidBack({
      closeSelection: vi.fn(), editing: true, exit, finishEditing, selectionOpen: false
    }));
    act(() => { dispatchCompanionAndroidBack(); });
    expect(finishEditing).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
  });
});
