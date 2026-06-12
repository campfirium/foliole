// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { electronMocks } = vi.hoisted(() => {
  const getAllWindows = vi.fn<() => unknown[]>(() => []);
  return {
    electronMocks: {
      app: { getAppPath: vi.fn(() => '/app') },
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

import {
  prepareGlobalClipDesktopToastWindow,
  resetGlobalClipDesktopToastWindowForTests,
  showGlobalClipDesktopToast
} from './globalClipDesktopToast.js';

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
      executeJavaScript: vi.fn(async () => undefined),
      send: vi.fn()
    }
  };
}

const zhHansStrings = {
  hideHint: '×',
  hideHintLabel: '隐藏提示',
  hint: '回车保存，空白时导入剪贴板',
  locale: 'zh-Hans' as const,
  placeholder: '...',
  save: '保存',
  showHint: '?',
  showHintLabel: '显示提示'
};

const darkTheme = {
  accent: 'rgb(127, 177, 141)',
  background: 'rgb(42, 45, 41)',
  border: 'rgb(80, 84, 78)',
  foreground: 'rgb(232, 230, 223)',
  hasAppTheme: true,
  inputBackground: 'rgb(36, 39, 35)',
  mutedForeground: 'rgb(165, 164, 159)',
  strings: zhHansStrings
};

const lightTheme = {
  accent: 'rgb(63, 143, 104)',
  background: 'rgb(255, 255, 255)',
  border: 'rgb(188, 189, 187)',
  foreground: 'rgb(32, 33, 36)',
  hasAppTheme: true,
  inputBackground: 'rgb(246, 246, 246)',
  mutedForeground: 'rgb(94, 95, 97)',
  strings: zhHansStrings
};

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
  const executeJavaScript = vi.fn(async () => darkTheme);
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
  expect(decodeURIComponent(loadedUrl)).toContain('已剪辑');
  expect(decodeURIComponent(loadedUrl)).toContain('已保存到收件箱');
  expect(toastWindow.showInactive).toHaveBeenCalledTimes(1);
});

it('keeps localized toast status text when the notification updates', async () => {
  vi.useFakeTimers();
  const executeJavaScript = vi.fn(async () => darkTheme);
  const toastWindow = createToastWindow();
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([{
    isDestroyed: vi.fn(() => false),
    webContents: { executeJavaScript }
  }]);
  electronMocks.BrowserWindow.mockImplementation(function BrowserWindow() {
    return toastWindow;
  });

  const toast = showGlobalClipDesktopToast('pending');
  await flushToastLoad(toastWindow);
  toast.update('success', 'node-1', 'Captured source preview');

  const latestCall = toastWindow.webContents.executeJavaScript.mock.calls.at(-1) as [string, boolean] | undefined;
  const latestScript = latestCall?.[0] ?? '';
  expect(latestScript).toContain('已保存到收件箱');
  expect(latestScript).not.toContain('Saved to Inbox');
});

it('refreshes a prewarmed toast with the current theme before first display', async () => {
  vi.useFakeTimers();
  const toastWindow = createToastWindow();
  const executeJavaScript = vi.fn()
    .mockResolvedValueOnce(darkTheme)
    .mockResolvedValueOnce(lightTheme);
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([{
    isDestroyed: vi.fn(() => false),
    webContents: { executeJavaScript }
  }]);
  electronMocks.BrowserWindow.mockImplementation(function BrowserWindow() {
    return toastWindow;
  });

  prepareGlobalClipDesktopToastWindow();
  await flushToastLoad(toastWindow);
  showGlobalClipDesktopToast();
  await flushToastLoad(toastWindow);

  const loadedUrl = toastWindow.loadURL.mock.calls[0]?.[0] ?? '';
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-bg:rgb(42, 45, 41);');
  expect(toastWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
    expect.stringContaining('--capture-bg:rgb(255, 255, 255);'),
    true
  );
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
  const executeJavaScript = vi.fn(async () => lightTheme);
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
