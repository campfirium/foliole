import { expect, it, vi } from 'vitest';

import {
  configureDesktopUpdater, resolveElectronUpdater, type DesktopUpdaterAdapter
} from './desktopUpdateAdapter.js';

function createUpdater() {
  return {
    allowDowngrade: false,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    on: vi.fn(),
    quitAndInstall: vi.fn(),
    setFeedURL: vi.fn()
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

it('reports a native updater error so a pending restart can become retryable', () => {
  const updater = createUpdater();
  const publish = vi.fn();
  configureDesktopUpdater(updater, () => '0.7.3', publish);

  const errorListener = updater.on.mock.calls.find(([event]) => event === 'error')?.[1];
  errorListener?.(new Error('ShipIt unavailable'));

  expect(publish).toHaveBeenCalledWith({
    errorCode: 'install-failed', phase: 'ready', version: '0.7.3'
  });
});
