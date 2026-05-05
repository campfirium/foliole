import { beforeEach, expect, it, vi } from 'vitest';

import {
  getRuntimeInvoke,
  listRuntimeSystemFonts,
  onMainWindowResized,
  onNativeMenuCommand,
  openExternalUrl,
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
  window.electronAPI = undefined;
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
  const invoke = vi.fn().mockResolvedValue({ app_data_dir: '/data' });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(resolveRuntimeAppPaths()).resolves.toBeNull();
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
