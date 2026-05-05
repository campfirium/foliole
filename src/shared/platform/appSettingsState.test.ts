import { beforeEach, expect, it, vi } from 'vitest';

import { loadRuntimeAppSettingsState, saveRuntimeAppSettingsState } from './appSettingsState';

function createMockElectronApi(invoke: ReturnType<typeof vi.fn>) {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  window.electronAPI = undefined;
});

it('loads runtime app settings through the platform bridge', async () => {
  const invoke = vi.fn().mockResolvedValue({
    'foliole-ui-font-preset': 'inter',
    invalid: 42
  });
  window.electronAPI = createMockElectronApi(invoke);

  await expect(loadRuntimeAppSettingsState()).resolves.toEqual({
    'foliole-ui-font-preset': 'inter'
  });
  expect(invoke).toHaveBeenCalledWith('load_app_settings_state');
});

it('returns null when runtime app settings load is unavailable', async () => {
  await expect(loadRuntimeAppSettingsState()).resolves.toBeNull();
});

it('saves runtime app settings through the platform bridge', async () => {
  const invoke = vi.fn().mockResolvedValue(null);
  window.electronAPI = createMockElectronApi(invoke);

  await expect(saveRuntimeAppSettingsState({ 'foliole-ui-font-preset': 'inter' })).resolves.toBe(true);
  expect(invoke).toHaveBeenCalledWith('save_app_settings_state', {
    settings: { 'foliole-ui-font-preset': 'inter' }
  });
});
