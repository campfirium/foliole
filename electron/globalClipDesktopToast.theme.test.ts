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
  return {
    close: vi.fn(),
    hookWindowMessage: vi.fn(),
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn<(_url: string) => Promise<void>>(async () => undefined),
    moveTop: vi.fn(),
    on: vi.fn(),
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
  electronMocks.nativeTheme.shouldUseDarkColors = false;
});

it('uses the current app floating theme for the desktop toast', async () => {
  vi.useFakeTimers();
  const executeJavaScript = vi.fn(async () => ({
    accent: 'rgb(127, 177, 141)',
    background: 'rgb(42, 45, 41)',
    border: 'rgb(80, 84, 78)',
    foreground: 'rgb(232, 230, 223)',
    hasAppTheme: true,
    inputBackground: 'rgb(36, 39, 35)',
    mutedForeground: 'rgb(165, 164, 159)'
  }));
  const toastWindow = createToastWindow();
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([{
    isDestroyed: vi.fn(() => false),
    webContents: { executeJavaScript }
  }]);
  electronMocks.BrowserWindow.mockImplementation(function BrowserWindow() {
    return toastWindow;
  });

  showGlobalClipDesktopToast();
  await flushToastLoad(toastWindow);

  expect(executeJavaScript).toHaveBeenCalledTimes(1);
  const loadedUrl = toastWindow.loadURL.mock.calls[0]?.[0] ?? '';
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-bg:rgb(42, 45, 41);');
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-fg:rgb(232, 230, 223);');
  expect(toastWindow.showInactive).toHaveBeenCalledTimes(1);
});

it('falls back and shows the toast when app theme reading stalls', async () => {
  vi.useFakeTimers();
  const toastWindow = createToastWindow();
  const neverResolves = new Promise(() => undefined);
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([{
    isDestroyed: vi.fn(() => false),
    webContents: { executeJavaScript: vi.fn(() => neverResolves) }
  }]);
  electronMocks.BrowserWindow.mockImplementation(function BrowserWindow() {
    return toastWindow;
  });

  showGlobalClipDesktopToast();
  await Promise.resolve();
  expect(toastWindow.showInactive).not.toHaveBeenCalled();

  vi.advanceTimersByTime(120);
  await flushToastLoad(toastWindow);

  expect(toastWindow.showInactive).toHaveBeenCalledTimes(1);
  expect(toastWindow.close).not.toHaveBeenCalled();

  vi.advanceTimersByTime(3000);

  expect(toastWindow.close).toHaveBeenCalledTimes(1);
});

it('does not read the theme from the toast window itself', async () => {
  vi.useFakeTimers();
  const toastWindow = createToastWindow();
  const executeJavaScript = vi.fn(async () => ({
    accent: 'rgb(63, 143, 104)',
    background: 'rgb(255, 255, 255)',
    border: 'rgb(188, 189, 187)',
    foreground: 'rgb(32, 33, 36)',
    hasAppTheme: true,
    inputBackground: 'rgb(246, 246, 246)',
    mutedForeground: 'rgb(94, 95, 97)'
  }));
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([
    toastWindow,
    {
      isDestroyed: vi.fn(() => false),
      webContents: { executeJavaScript }
    }
  ]);
  electronMocks.BrowserWindow.mockImplementation(function BrowserWindow() {
    return toastWindow;
  });

  showGlobalClipDesktopToast();
  await flushToastLoad(toastWindow);

  expect(executeJavaScript).toHaveBeenCalledTimes(1);
  expect(toastWindow.showInactive).toHaveBeenCalledTimes(1);
});
