import { beforeEach, expect, it, vi } from 'vitest';

import {
  getRuntimeInvoke,
  listRuntimeSystemFonts,
  onMainWindowResized,
  onNativeMenuCommand,
  openExternalUrl,
  reportRuntimeAppReady,
  reportRuntimeBootStage,
  resolveRuntimeAppPaths
} from './bridge';
import type { ElectronAPI } from './electronApi';

function createMockElectronApi(invoke: ElectronAPI['invoke']): ElectronAPI {
  return {
    invoke,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.electronAPI = undefined;
  window.__FOLIOLE_APP_READY_REPORTED__ = undefined;
});

it('returns null runtime invoke outside desktop runtime', () => {
  expect(getRuntimeInvoke()).toBeNull();
});

it('resolves runtime app paths via native invoke', async () => {
  const invoke = vi.fn().mockResolvedValue({
    app_data_dir: '/data',
    app_config_dir: '/config',
    app_cache_dir: '/cache',
    app_log_dir: '/log'
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(resolveRuntimeAppPaths()).resolves.toEqual({
    appDataDir: '/data',
    appConfigDir: '/config',
    appCacheDir: '/cache',
    appLogDir: '/log'
  });
  expect(invoke).toHaveBeenCalledWith('resolve_app_paths');
});

it('returns null app paths when payload is malformed', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const invoke = vi.fn().mockResolvedValue({ app_data_dir: '/data' });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(resolveRuntimeAppPaths()).resolves.toBeNull();
  expect(warn).toHaveBeenCalledWith(
    '[bridge] native app path payload invalid',
    expect.objectContaining({
      area: 'bridge',
      action: 'resolve_runtime_app_paths',
      command: 'resolve_app_paths',
      fallback: 'return_null'
    })
  );
});

it('normalizes runtime system font payload', async () => {
  const invoke = vi.fn().mockResolvedValue({
    fonts: ['Inter', 1, 'JetBrains Mono'],
    monospace_fonts: ['JetBrains Mono', null]
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(listRuntimeSystemFonts()).resolves.toEqual({
    fonts: ['Inter', 'JetBrains Mono'],
    monospaceFonts: ['JetBrains Mono']
  });
  expect(invoke).toHaveBeenCalledWith('list_system_fonts');
});

it('opens external urls through typed native invoke when available', async () => {
  const invoke = vi.fn().mockResolvedValue(null);
  window.electronAPI = createMockElectronApi(invoke as ElectronAPI['invoke']);

  await openExternalUrl('https://example.com/docs');

  expect(invoke).toHaveBeenCalledWith('open_external_url', { url: 'https://example.com/docs' });
});

it('logs and falls back when native external URL open fails', async () => {
  const invoke = vi.fn().mockRejectedValue(new Error('shell disabled'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  window.electronAPI = createMockElectronApi(invoke as ElectronAPI['invoke']);

  await openExternalUrl('https://example.com/docs');

  expect(warn).toHaveBeenCalledWith(
    '[bridge] native external URL open failed',
    expect.objectContaining({
      area: 'bridge',
      action: 'open_external_url',
      command: 'open_external_url',
      fallback: 'window.open',
      target: 'https://example.com/docs',
      error: { name: 'Error', message: 'shell disabled' }
    })
  );
  expect(open).toHaveBeenCalledWith('https://example.com/docs', '_blank', 'noopener,noreferrer');
});

it('reports boot stages through the typed boot report contract', async () => {
  const invoke = vi.fn().mockResolvedValue(null);
  window.electronAPI = createMockElectronApi(invoke);

  reportRuntimeBootStage('boot_start', { mode: 'desktop' });
  await Promise.resolve();

  expect(invoke).toHaveBeenCalledWith('boot_report', {
    stage: 'boot_start',
    payload: { mode: 'desktop' }
  });
});

it('only reports runtime app ready once per window lifecycle', async () => {
  const invoke = vi.fn().mockResolvedValue(null);
  window.electronAPI = createMockElectronApi(invoke);

  reportRuntimeAppReady({ first: true });
  reportRuntimeAppReady({ first: false });
  await Promise.resolve();

  expect(invoke).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledWith('boot_report', {
    stage: 'app_ready',
    payload: { first: true }
  });
});

it('subscribes window resize through typed electron bridge', async () => {
  const unlisten = vi.fn();
  const onWindowResized = vi.fn().mockReturnValue(unlisten);
  window.electronAPI = {
    ...createMockElectronApi(vi.fn()),
    onWindowResized
  };
  const handler = vi.fn();

  await expect(onMainWindowResized(handler)).resolves.toBe(unlisten);

  expect(onWindowResized).toHaveBeenCalledWith(handler);
});

it('filters empty native menu events before reaching the handler', async () => {
  const onNativeMenuCommandBridge = vi.fn((handler: (commandId: string) => void) => {
    handler('');
    handler('__menu_focus_sync__');
    handler('workspace.open-command-palette');
    return () => undefined;
  });
  window.electronAPI = {
    ...createMockElectronApi(vi.fn()),
    onNativeMenuCommand: onNativeMenuCommandBridge
  };
  const handler = vi.fn();

  await onNativeMenuCommand(handler);

  expect(handler).toHaveBeenCalledTimes(1);
  expect(handler).toHaveBeenCalledWith('workspace.open-command-palette');
});
