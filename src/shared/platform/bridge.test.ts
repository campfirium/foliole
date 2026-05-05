import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke, listRuntimeSystemFonts, resolveRuntimeAppPaths } from './bridge';
import { isTauriRuntime } from './runtime';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}));

vi.mock('./runtime', () => ({
  isTauriRuntime: vi.fn()
}));

describe('platform bridge runtime contracts', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(isTauriRuntime).mockReset();
  });

  it('returns null runtime invoke outside tauri runtime', () => {
    vi.mocked(isTauriRuntime).mockReturnValue(false);
    expect(getRuntimeInvoke()).toBeNull();
  });

  it('resolves runtime app paths via tauri invoke', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue({
      app_data_dir: '/data',
      app_config_dir: '/config',
      app_cache_dir: '/cache',
      app_log_dir: '/log'
    });

    await expect(resolveRuntimeAppPaths()).resolves.toEqual({
      appDataDir: '/data',
      appConfigDir: '/config',
      appCacheDir: '/cache',
      appLogDir: '/log'
    });
    expect(invoke).toHaveBeenCalledWith('resolve_app_paths');
  });

  it('returns null app paths when payload is malformed', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue({ app_data_dir: '/data' });

    await expect(resolveRuntimeAppPaths()).resolves.toBeNull();
  });

  it('normalizes runtime system font payload', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue({
      fonts: ['Inter', 1, 'JetBrains Mono'],
      monospace_fonts: ['JetBrains Mono', null]
    });

    await expect(listRuntimeSystemFonts()).resolves.toEqual({
      fonts: ['Inter', 'JetBrains Mono'],
      monospaceFonts: ['JetBrains Mono']
    });
    expect(invoke).toHaveBeenCalledWith('list_system_fonts');
  });
});
