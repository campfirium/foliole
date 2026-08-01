import { expect, it, vi } from 'vitest';

import { resolveElectronUpdater, type DesktopUpdaterAdapter } from './desktopUpdateAdapter.js';

function createUpdater() {
  return {
    allowDowngrade: false,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    on: vi.fn(),
    quitAndInstall: vi.fn()
  } satisfies DesktopUpdaterAdapter;
}

it('resolves autoUpdater from the CommonJS default namespace used by ESM import', () => {
  const updater = createUpdater();

  expect(resolveElectronUpdater({ default: { autoUpdater: updater } })).toBe(updater);
});

it('rejects a named-export-only shape that is absent at runtime', () => {
  expect(() => resolveElectronUpdater({ autoUpdater: createUpdater() })).toThrow(
    'electron-updater CommonJS default export is unavailable'
  );
});
