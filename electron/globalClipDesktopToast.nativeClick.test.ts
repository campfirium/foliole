// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { electronMocks } = vi.hoisted(() => {
  const getAllWindows = vi.fn<() => unknown[]>(() => []);
  return {
    electronMocks: {
      BrowserWindow: Object.assign(vi.fn(function BrowserWindow() {
        return {};
      }), { getAllWindows }),
      ipcMain: {
        on: vi.fn()
      },
      nativeTheme: {
        shouldUseDarkColors: false
      },
      screen: {
        getPrimaryDisplay: vi.fn(() => ({
          workArea: { height: 900, width: 1400, x: 0, y: 0 }
        }))
      }
    }
  };
});
const waitForRendererAppReady = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => undefined));

vi.mock('electron', () => electronMocks);
vi.mock('./ipc/boot.js', () => ({ waitForRendererAppReady }));

import { resetGlobalClipDesktopToastWindowForTests, showGlobalClipDesktopToast } from './globalClipDesktopToast.js';

function createToastWindow() {
  const closedHandlers: Array<() => void> = [];
  return {
    close: vi.fn(() => {
      closedHandlers.forEach((handler) => handler());
    }),
    hookWindowMessage: vi.fn(),
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn<(_url: string) => Promise<void>>(async () => undefined),
    moveTop: vi.fn(),
    on: vi.fn(),
    once: vi.fn((event: string, handler: () => void) => {
      if (event === 'closed') closedHandlers.push(handler);
    }),
    setAlwaysOnTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    showInactive: vi.fn(),
    webContents: {
      id: 42,
      executeJavaScript: vi.fn(),
      send: vi.fn()
    }
  };
}

async function flushToastLoad(toastWindow: ReturnType<typeof createToastWindow>) {
  for (let index = 0; index < 10 && toastWindow.showInactive.mock.calls.length === 0; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  resetGlobalClipDesktopToastWindowForTests();
  vi.clearAllMocks();
  vi.useRealTimers();
  waitForRendererAppReady.mockResolvedValue(undefined);
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([]);
});

it('opens the success target from the native Windows mouse release message', async () => {
  vi.useFakeTimers();
  const toastWindow = createToastWindow();
  const mainWindow = {
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isFullScreen: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    maximize: vi.fn(),
    restore: vi.fn(),
    setFullScreen: vi.fn(),
    show: vi.fn(),
    webContents: {
      id: 7,
      send: vi.fn()
    }
  };
  electronMocks.BrowserWindow.mockImplementation(function BrowserWindow() {
    return toastWindow;
  });
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([toastWindow, mainWindow]);

  const toast = showGlobalClipDesktopToast('pending');
  await flushToastLoad(toastWindow);
  toast.update('success', 'node-1', 'Captured source preview');
  const nativeClickHandler = toastWindow.hookWindowMessage.mock.calls[0]?.[1];
  expect(nativeClickHandler).toEqual(expect.any(Function));

  nativeClickHandler?.();
  await vi.advanceTimersByTimeAsync(300);

  expect(mainWindow.show).toHaveBeenCalledTimes(2);
  expect(mainWindow.maximize).not.toHaveBeenCalled();
  expect(mainWindow.setFullScreen).not.toHaveBeenCalled();
  expect(mainWindow.focus).toHaveBeenCalledTimes(2);
  expect(mainWindow.webContents.send).toHaveBeenCalledWith(
    'foliole:global-capture-navigate',
    { nodeId: 'node-1' }
  );
  expect(toastWindow.close).toHaveBeenCalledTimes(1);
});
