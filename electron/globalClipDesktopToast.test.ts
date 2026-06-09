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

vi.mock('electron', () => electronMocks);

import { showGlobalClipDesktopToast } from './globalClipDesktopToast.js';

function createToastWindow() {
  return {
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn<(_url: string) => Promise<void>>(async () => undefined),
    setAlwaysOnTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    showInactive: vi.fn(),
    webContents: {
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
  vi.clearAllMocks();
  vi.useRealTimers();
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([]);
  electronMocks.nativeTheme.shouldUseDarkColors = false;
});

it('shows a non-focusable app-owned desktop toast and closes it automatically', async () => {
  vi.useFakeTimers();
  const toastWindow = createToastWindow();
  electronMocks.BrowserWindow.mockImplementation(function BrowserWindow() {
    return toastWindow;
  });

  showGlobalClipDesktopToast();
  await flushToastLoad(toastWindow);

  expect(electronMocks.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
    alwaysOnTop: true,
    focusable: false,
    frame: false,
    skipTaskbar: true,
    transparent: true,
    x: 1042,
    y: 810
  }));
  expect(toastWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
  expect(toastWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
  expect(toastWindow.showInactive).toHaveBeenCalledTimes(1);
  const loadedUrl = toastWindow.loadURL.mock.calls[0]?.[0] ?? '';
  const html = decodeURIComponent(loadedUrl);
  expect(html).toContain('Clipped');
  expect(html).toContain('Saved to Inbox');
  expect(html).toContain('--capture-bg:rgb(255, 255, 255);');
  expect(html).toContain('grid-template-columns:16px 1fr 18px');
  expect(html).toContain('data:image/svg+xml;base64');
  expect(html).toContain('height:18px');
  expect(html).not.toContain('class="badge"');

  vi.advanceTimersByTime(3000);

  expect(toastWindow.close).toHaveBeenCalledTimes(1);
});

it('updates the same pending toast before closing it', async () => {
  vi.useFakeTimers();
  const toastWindow = createToastWindow();
  electronMocks.BrowserWindow.mockImplementation(function BrowserWindow() {
    return toastWindow;
  });

  const toast = showGlobalClipDesktopToast('pending');
  await flushToastLoad(toastWindow);

  expect(toastWindow.showInactive).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1800);
  expect(toastWindow.close).not.toHaveBeenCalled();

  toast.update('success', 'node-1', 'Captured source preview');

  expect(toastWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
    expect.stringContaining('"status":"success"'),
    true
  );
  expect(toastWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
    expect.stringContaining('Captured source preview'),
    true
  );
  expect(toastWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  expect(toastWindow.webContents.send).toHaveBeenCalledWith(
    'foliole:global-capture-toast:target',
    { nodeId: 'node-1' }
  );

  vi.advanceTimersByTime(3000);

  expect(toastWindow.close).toHaveBeenCalledTimes(1);
});

it('keeps the success preview when import finishes before the toast loads', async () => {
  vi.useFakeTimers();
  const toastWindow = createToastWindow();
  electronMocks.BrowserWindow.mockImplementation(function BrowserWindow() {
    return toastWindow;
  });

  const toast = showGlobalClipDesktopToast('pending');
  toast.update('success', 'node-1', 'Fast captured preview');
  await flushToastLoad(toastWindow);

  expect(toastWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
    expect.stringContaining('Fast captured preview'),
    true
  );
  expect(toastWindow.webContents.send).toHaveBeenCalledWith(
    'foliole:global-capture-toast:target',
    { nodeId: 'node-1' }
  );
  expect(toastWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
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
