import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { dispatchCompanionAndroidBack } from './companionAndroidBackEvent';
import { CompanionFlowHistoryContext } from './CompanionFlowHistoryContext';
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

it.each(['selection', 'editing', 'busy', 'empty', 'undo'] as const)('handles Flow Back with %s without exiting reading', state => {
  const apply = vi.fn();
  const closeSelection = vi.fn();
  const finishEditing = vi.fn(async () => {});
  const exit = vi.fn();
  renderHook(() => useCompanionReadableAndroidBack({
    editing: state === 'editing', selectionOpen: state === 'selection', closeSelection, finishEditing, exit
  }), { wrapper: ({ children }) => <CompanionFlowHistoryContext.Provider value={{
    busy: state === 'busy', canUndo: state !== 'empty', canRedo: false, refreshPending: false, apply
  }}>{children}</CompanionFlowHistoryContext.Provider> });
  act(() => { expect(dispatchCompanionAndroidBack()).toBe(true); });
  expect(exit).not.toHaveBeenCalled();
  expect(apply.mock.calls).toEqual(state === 'undo' ? [['undo']] : []);
  expect(closeSelection).toHaveBeenCalledTimes(state === 'selection' ? 1 : 0);
  expect(finishEditing).toHaveBeenCalledTimes(state === 'editing' ? 1 : 0);
});
