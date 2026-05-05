import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from './bridge';
import { installDesktopDebugProbe, readDesktopDebugProbe, resetDesktopDebugProbeState } from './desktopDebugProbe';
import type { ElectronAPI } from './electronApi';

function createMockElectronApi(invoke: ElectronAPI['invoke'], runtimeHead: string | null = null): ElectronAPI {
  return {
    debug: { runtimeHead },
    invoke,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.electronAPI = undefined;
  resetDesktopDebugProbeState();
});

it('exposes desktop debug probe snapshot with bridge availability and runtime head', () => {
  window.electronAPI = createMockElectronApi(vi.fn(), 'abc123');

  installDesktopDebugProbe();

  expect(window.__FOLIOLE_DESKTOP_DEBUG_PROBE__?.getSnapshot()).toEqual({
    bridgeAvailable: true,
    recentInvokeFailures: [],
    runtimeHead: 'abc123'
  });
});

it('records recent native invoke failures through runtime invoke wrapper', async () => {
  const invoke = vi.fn().mockRejectedValue(new Error('bridge down'));
  window.electronAPI = createMockElectronApi(invoke, 'head-1');
  installDesktopDebugProbe();

  const runtimeInvoke = getRuntimeInvoke();
  expect(runtimeInvoke).not.toBeNull();
  await expect(runtimeInvoke!('resolve_app_paths')).rejects.toThrow('bridge down');

  expect(readDesktopDebugProbe()).toEqual({
    bridgeAvailable: true,
    recentInvokeFailures: [
      expect.objectContaining({
        command: 'resolve_app_paths',
        error: { message: 'bridge down', name: 'Error' }
      })
    ],
    runtimeHead: 'head-1'
  });
});
