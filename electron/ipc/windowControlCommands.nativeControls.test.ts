// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const { getDisplayMatching, mockWindow, setMainWindowNativeControlsVisible } = vi.hoisted(() => ({
  getDisplayMatching: vi.fn(),
  mockWindow: {
    getBounds: vi.fn(() => ({ x: -940, y: 0, width: 960, height: 850 })),
    isDestroyed: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    webContents: { toggleDevTools: vi.fn() }
  },
  setMainWindowNativeControlsVisible: vi.fn()
}));

vi.mock('electron', () => ({
  app: { exit: vi.fn(), isPackaged: false, relaunch: vi.fn() },
  screen: { getDisplayMatching },
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

it('uses the work area of the display matched to the window bounds', async () => {
  getDisplayMatching.mockReturnValue({ workArea: { width: 1600 } });
  await expect(handleWindowControlCommand({ command: 'window_sidebar_layout_metrics' }))
    .resolves.toEqual({ windowWidth: 960, workAreaWidth: 1600 });
  expect(getDisplayMatching).toHaveBeenCalledWith({ x: -940, y: 0, width: 960, height: 850 });
});

it('returns no metrics for an unavailable work area', async () => {
  getDisplayMatching.mockReturnValue({ workArea: { width: 0 } });
  await expect(handleWindowControlCommand({ command: 'window_sidebar_layout_metrics' })).resolves.toBeNull();
});
