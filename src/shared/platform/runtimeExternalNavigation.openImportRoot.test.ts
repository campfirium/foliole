import { beforeEach, expect, it, vi } from 'vitest';

import type { ElectronAPI } from './electronApi';
import { openImportRoot } from './runtimeExternalNavigation';

function createMockElectronApi(invoke: ElectronAPI['invoke']): ElectronAPI {
  return {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete window.electronAPI;
});

it('opens the Import root through a semantic native command', async () => {
  const invoke = vi.fn().mockResolvedValue(null);
  window.electronAPI = createMockElectronApi(invoke as ElectronAPI['invoke']);

  await openImportRoot();

  expect(invoke).toHaveBeenCalledWith('open_import_root');
});
