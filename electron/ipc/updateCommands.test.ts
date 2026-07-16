import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  getMainWindow: vi.fn(),
  service: {
    check: vi.fn(),
    download: vi.fn(),
    install: vi.fn()
  }
}));

vi.mock('electron', () => ({ BrowserWindow: { fromWebContents: mocks.fromWebContents } }));
vi.mock('../mainWindowRegistry.js', () => ({ getMainWindow: mocks.getMainWindow }));
vi.mock('../update/desktopUpdateRuntime.js', () => ({ desktopUpdateService: mocks.service }));

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';

import { handleDesktopUpdateCommand } from './updateCommands.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('accepts update commands only from the registered main window sender', async () => {
  const sender = {};
  const mainWindow = { isDestroyed: () => false, webContents: sender };
  mocks.getMainWindow.mockReturnValue(mainWindow);
  mocks.fromWebContents.mockReturnValue(mainWindow);
  mocks.service.check.mockResolvedValue({ phase: 'checking' });

  await handleDesktopUpdateCommand({
    args: { targetVersion: '0.7.0' },
    command: NATIVE_COMMANDS.desktopUpdateCheck
  }, { sender: sender as never });

  expect(mocks.service.check).toHaveBeenCalledWith('0.7.0', sender);
});

it('rejects an update command from embedded or unregistered web contents', () => {
  const sender = {};
  mocks.getMainWindow.mockReturnValue({ isDestroyed: () => false, webContents: {} });

  expect(() => handleDesktopUpdateCommand({
    command: NATIVE_COMMANDS.desktopUpdateDownload
  }, { sender: sender as never })).toThrow('non-main-window sender');
  expect(mocks.service.download).not.toHaveBeenCalled();
});
