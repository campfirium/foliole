// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const { mockWindow, setMainWindowNativeControlsVisible } = vi.hoisted(() => ({
  mockWindow: {
    isMaximized: vi.fn(() => false),
    webContents: { toggleDevTools: vi.fn() }
  },
  setMainWindowNativeControlsVisible: vi.fn()
}));

vi.mock('electron', () => ({
  app: { exit: vi.fn(), isPackaged: false, relaunch: vi.fn() },
  BrowserWindow: {
    fromWebContents: vi.fn(() => mockWindow),
    getFocusedWindow: vi.fn(() => mockWindow)
  }
}));
vi.mock('../backgroundPresence.js', () => ({
  isAppQuittingForBackgroundPresence: vi.fn(() => false)
}));
vi.mock('../devShellRestartRequest.js', () => ({
  requestDevShellRestart: vi.fn(() => false)
}));
vi.mock('../mainWindowChrome.js', () => ({ setMainWindowNativeControlsVisible }));
vi.mock('../readingProgressWindowFlush.js', () => ({
  allowWindowCloseWithoutReadingProgressFlush: vi.fn(),
  flushWindowReadingProgress: vi.fn().mockResolvedValue(undefined)
}));

import { handleWindowControlCommand } from './windowControlCommands.js';

beforeEach(() => {
  vi.clearAllMocks();
});

it('routes explicit native-control visibility to the owning window', async () => {
  await expect(handleWindowControlCommand({
    command: 'window_set_native_controls_visible',
    args: { visible: false }
  })).resolves.toBeNull();

  expect(setMainWindowNativeControlsVisible).toHaveBeenCalledWith(mockWindow, false);
});

it('rejects malformed native-control visibility payloads', async () => {
  await expect(handleWindowControlCommand({
    command: 'window_set_native_controls_visible',
    args: { visible: 'false' }
  })).rejects.toThrow('invalid argument: visible');
});
