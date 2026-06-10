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
  const hookWindowMessage = vi.fn();
  return {
    close: vi.fn(),
    hookWindowMessage,
    isDestroyed: vi.fn(() => false),
    loadURL: vi.fn<(_url: string) => Promise<void>>(async () => undefined),
    moveTop: vi.fn(),
    on: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setOpacity: vi.fn(),
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
  vi.clearAllMocks();
  vi.useRealTimers();
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([]);
  electronMocks.nativeTheme.shouldUseDarkColors = false;
});

it('shows an app-owned desktop toast and closes it automatically', async () => {
  vi.useFakeTimers();
  const toastWindow = createToastWindow();
  electronMocks.BrowserWindow.mockImplementation(function BrowserWindow() {
    return toastWindow;
  });

  showGlobalClipDesktopToast();
  await flushToastLoad(toastWindow);

  expect(electronMocks.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    focusable: true,
    frame: false,
    height: 116,
    skipTaskbar: true,
    transparent: true,
    width: 384,
    x: 1020,
    y: 788
  }));
  expect(toastWindow.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver');
  expect(toastWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
  expect(toastWindow.setOpacity).toHaveBeenNthCalledWith(1, 0);
  expect(toastWindow.setOpacity).toHaveBeenLastCalledWith(1);
  expect(toastWindow.setOpacity.mock.invocationCallOrder.at(-1)).toBeLessThan(
    toastWindow.showInactive.mock.invocationCallOrder[0] ?? 0
  );
  expect(toastWindow.hookWindowMessage).toHaveBeenCalledWith(0x0202, expect.any(Function));
  expect(toastWindow.showInactive).toHaveBeenCalledTimes(1);
  const loadedUrl = toastWindow.loadURL.mock.calls[0]?.[0] ?? '';
  const html = decodeURIComponent(loadedUrl);
  expect(html).toContain('Clipped');
  expect(html).toContain('Saved to Inbox');
  expect(html).toContain('--capture-bg:rgb(255, 255, 255);');
  expect(html).toContain('body{padding:22px;}');
  expect(html).toContain('grid-template-columns:16px 1fr 18px');
  expect(html).toContain('font-weight:500');
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
    expect.stringContaining("toast.dataset.clickable = state.status === 'success' && Boolean(targetNodeId)"),
    true
  );
  expect(toastWindow.webContents.executeJavaScript).toHaveBeenCalledWith(
    expect.stringContaining('Captured source preview'),
    true
  );
  expect(toastWindow.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  expect(toastWindow.moveTop).toHaveBeenCalledTimes(1);
  expect(toastWindow.setIgnoreMouseEvents.mock.invocationCallOrder.at(-1)).toBeLessThan(
    toastWindow.moveTop.mock.invocationCallOrder[0] ?? 0
  );
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
