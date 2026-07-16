import { beforeEach, expect, it, vi } from 'vitest';

import { installDesktopDebugProbe, readDesktopDebugProbe, resetDesktopDebugProbeState } from './desktopDebugProbe';
import type { ElectronAPI } from './electronApi';
import { getRuntimeInvoke } from './runtimeInvoke';

function createMockElectronApi(invoke: ElectronAPI['invoke'], runtimeHead: string | null = null): ElectronAPI {
  return {
    debug: { preloadPath: '/workspace/foliole/electron/preload.cjs', runtimeHead },
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete window.electronAPI;
  resetDesktopDebugProbeState();
});

it('exposes desktop debug probe snapshot with bridge availability and runtime head', () => {
  window.electronAPI = createMockElectronApi(vi.fn(), 'abc123');

  installDesktopDebugProbe();

  expect(window.__FOLIOLE_DESKTOP_DEBUG_PROBE__?.getSnapshot()).toEqual({
    bridgeAvailable: true,
    preloadPath: '/workspace/foliole/electron/preload.cjs',
    recentInvokes: [],
    recentInvokeFailures: [],
    runtimeHead: 'abc123'
  });
});

it('records recent native invoke history through runtime invoke wrapper', async () => {
  const invoke = vi.fn(((command: string) => {
    if (command === 'app_get_version') {
      return Promise.resolve('0.1.0');
    }
    return Promise.reject(new Error('bridge down'));
  }) as ElectronAPI['invoke']);
  window.electronAPI = createMockElectronApi(invoke, 'head-1');
  installDesktopDebugProbe();

  const runtimeInvoke = getRuntimeInvoke();
  expect(runtimeInvoke).not.toBeNull();
  await expect(runtimeInvoke!('app_get_version', { verbose: true })).resolves.toBe('0.1.0');
  await expect(runtimeInvoke!('resolve_app_paths')).rejects.toThrow('bridge down');

  expect(readDesktopDebugProbe()).toEqual({
    bridgeAvailable: true,
    preloadPath: '/workspace/foliole/electron/preload.cjs',
    recentInvokes: [
      expect.objectContaining({
        command: 'resolve_app_paths',
        error: { message: 'bridge down', name: 'Error' },
        status: 'rejected'
      }),
      expect.objectContaining({
        command: 'app_get_version',
        status: 'resolved'
      })
    ],
    recentInvokeFailures: [
      expect.objectContaining({
        command: 'resolve_app_paths',
        error: { message: 'bridge down', name: 'Error' }
      })
    ],
    runtimeHead: 'head-1'
  });
  expect(readDesktopDebugProbe()?.recentInvokes[1]).not.toHaveProperty('args');
});

it('never records rejected sensitive native command arguments', async () => {
  const invoke = vi.fn(() => Promise.reject(new Error('save failed'))) as ElectronAPI['invoke'];
  window.electronAPI = createMockElectronApi(invoke);
  installDesktopDebugProbe();

  const runtimeInvoke = getRuntimeInvoke();
  await expect(runtimeInvoke!('save_discourse_publish_settings', {
    settings: { api_key: 'SENTINEL-DISCOURSE-SECRET', site_url: 'https://forum.example.com' }
  })).rejects.toThrow('save failed');

  const snapshot = readDesktopDebugProbe();
  expect(snapshot?.recentInvokes[0]).not.toHaveProperty('args');
  expect(snapshot?.recentInvokeFailures[0]).not.toHaveProperty('args');
  expect(JSON.stringify(snapshot)).not.toContain('SENTINEL-DISCOURSE-SECRET');
});

it('never records rejected WordPress connection credentials', async () => {
  const invoke = vi.fn(() => Promise.reject(new Error('connect failed'))) as ElectronAPI['invoke'];
  window.electronAPI = createMockElectronApi(invoke);
  installDesktopDebugProbe();

  const runtimeInvoke = getRuntimeInvoke();
  await expect(runtimeInvoke!('connect_wordpress_publish_settings', {
    settings: {
      application_password: 'SENTINEL-WORDPRESS-SECRET',
      site_url: 'https://free-site.wordpress.com',
      username: 'writer'
    }
  })).rejects.toThrow('connect failed');

  const snapshot = readDesktopDebugProbe();
  expect(snapshot?.recentInvokes[0]).not.toHaveProperty('args');
  expect(snapshot?.recentInvokeFailures[0]).not.toHaveProperty('args');
  expect(JSON.stringify(snapshot)).not.toContain('SENTINEL-WORDPRESS-SECRET');
});

it('keeps rejected non-sensitive arguments available for diagnostics', async () => {
  const invoke = vi.fn(() => Promise.reject(new Error('lookup failed'))) as ElectronAPI['invoke'];
  window.electronAPI = createMockElectronApi(invoke);
  installDesktopDebugProbe();

  const runtimeInvoke = getRuntimeInvoke();
  await expect(runtimeInvoke!('resolve_app_paths', { verbose: true })).rejects.toThrow('lookup failed');

  expect(readDesktopDebugProbe()?.recentInvokeFailures[0]).toHaveProperty('args', { verbose: true });
});
