import { beforeEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import packageJson from '../../../package.json';

import { loadAppVersion } from './appVersion';

beforeEach(() => {
  delete window.electronAPI;
});

it('loads the installed version through the desktop runtime bridge', async () => {
  const invoke = vi.fn().mockResolvedValue('0.1.3');
  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onWindowResized: () => () => undefined
  };

  await expect(loadAppVersion()).resolves.toBe('0.1.3');
  expect(invoke).toHaveBeenCalledWith(NATIVE_COMMANDS.appGetVersion);
});

it('uses the packaged version when no desktop runtime bridge exists', async () => {
  await expect(loadAppVersion()).resolves.toBe(packageJson.version);
});
