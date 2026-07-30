import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useImmersiveWindowChrome } from './useImmersiveWindowChrome';

const { setMainWindowNativeControlsVisible } = vi.hoisted(() => ({
  setMainWindowNativeControlsVisible: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../shared/platform/windowControls', () => ({
  setMainWindowNativeControlsVisible: (visible: boolean) =>
    setMainWindowNativeControlsVisible(visible)
}));

beforeEach(() => {
  setMainWindowNativeControlsVisible.mockClear();
});

it('hides native controls in immersive mode and restores them on exit', () => {
  const { rerender } = renderHook(
    ({ immersive }) => useImmersiveWindowChrome(immersive),
    { initialProps: { immersive: false } }
  );

  expect(setMainWindowNativeControlsVisible).toHaveBeenLastCalledWith(true);
  act(() => rerender({ immersive: true }));
  expect(setMainWindowNativeControlsVisible).toHaveBeenLastCalledWith(false);
  act(() => rerender({ immersive: false }));
  expect(setMainWindowNativeControlsVisible).toHaveBeenLastCalledWith(true);
});

it('restores native controls when immersive reading unmounts', () => {
  const { unmount } = renderHook(() => useImmersiveWindowChrome(true));
  expect(setMainWindowNativeControlsVisible).toHaveBeenLastCalledWith(false);

  act(() => unmount());

  expect(setMainWindowNativeControlsVisible).toHaveBeenLastCalledWith(true);
});
