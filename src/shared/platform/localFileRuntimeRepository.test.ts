import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import type { ElectronAPI } from './electronApi';
import { selectLocalFileToOpen } from './localFileRuntimeRepository';

beforeEach(() => {
  delete window.electronAPI;
});

it('routes Open File through the typed local-file native command', async () => {
  const invoke = vi.fn(async () => ({ absolutePath: '/docs/read.md', status: 'selected' }));
  window.electronAPI = {
    invoke: invoke as ElectronAPI['invoke'],
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  await expect(selectLocalFileToOpen()).resolves.toEqual({
    absolutePath: '/docs/read.md',
    status: 'selected'
  });
  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.selectLocalFileToOpen);
});
