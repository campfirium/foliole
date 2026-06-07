import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  handler: null as (() => void) | null,
  unsubscribe: vi.fn(),
  onMainWindowResized: vi.fn((handler: () => void) => {
    bridge.handler = handler;
    return Promise.resolve(bridge.unsubscribe);
  })
}));

vi.mock('../../shared/platform/windowControls', () => ({
  onMainWindowResized: bridge.onMainWindowResized
}));

import { useDesktopResizeRemeasureBridge } from './useDesktopResizeRemeasureBridge';

beforeEach(() => {
  bridge.handler = null;
  bridge.unsubscribe.mockClear();
  bridge.onMainWindowResized.mockClear();
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('turns native window resize notifications into renderer resize events', async () => {
  const resizeListener = vi.fn();
  window.addEventListener('resize', resizeListener);

  const { unmount } = renderHook(() => useDesktopResizeRemeasureBridge());
  await waitFor(() => expect(bridge.onMainWindowResized).toHaveBeenCalledTimes(1));

  bridge.handler?.();

  expect(resizeListener).toHaveBeenCalledTimes(3);
  unmount();
  expect(bridge.unsubscribe).toHaveBeenCalledTimes(1);
  window.removeEventListener('resize', resizeListener);
});
