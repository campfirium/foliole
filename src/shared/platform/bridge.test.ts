import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke, listRuntimeSystemFonts, resolveRuntimeAppPaths } from './bridge';

function createMockElectronApi(invoke: ReturnType<typeof vi.fn>) {
  return {
    invoke,
    on: () => () => undefined,
    windowControls: {
      close: async () => undefined,
      isMaximized: async () => false,
      minimize: async () => undefined,
      onResized: () => () => undefined,
      toggleMaximize: async () => undefined
    }
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
