// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const { electronMocks } = vi.hoisted(() => ({
  electronMocks: {
    BrowserWindow: {
      getAllWindows: vi.fn()
    },
    ipcMain: {
      on: vi.fn()
    }
  }
}));
const waitForRendererAppReady = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => undefined));

vi.mock('electron', () => electronMocks);
vi.mock('./ipc/boot.js', () => ({
  waitForRendererAppReady
}));

function createWindow(id: number, overrides: Partial<{
  destroyed: boolean;
  fullScreen: boolean;
  maximized: boolean;
  minimized: boolean;
  url: string;
}> = {}) {
  let fullScreen = overrides.fullScreen ?? false;
  let maximized = overrides.maximized ?? false;
  let minimized = overrides.minimized ?? false;
  return {
    focus: vi.fn(),
    isDestroyed: vi.fn(() => overrides.destroyed ?? false),
    isFullScreen: vi.fn(() => fullScreen),
    isMaximized: vi.fn(() => maximized),
    isMinimized: vi.fn(() => minimized),
    maximize: vi.fn(() => {
      maximized = true;
    }),
    restore: vi.fn(() => {
      minimized = false;
    }),
    setFullScreen: vi.fn((value: boolean) => {
      fullScreen = value;
    }),
    setMinimizedForTest: (value: boolean) => {
      minimized = value;
    },
    show: vi.fn(() => {
      fullScreen = false;
      maximized = false;
    }),
    webContents: {
      getURL: vi.fn(() => overrides.url ?? 'file:///workspace/foliole/dist/index.html'),
      id,
      send: vi.fn()
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.resetModules();
  waitForRendererAppReady.mockResolvedValue(undefined);
});

it('routes a clicked global clip toast to visible main windows only', async () => {
  const targetWindow = createWindow(1, { minimized: true });
  const senderToastWindow = createWindow(2, { url: 'data:text/html;charset=utf-8,toast' });
  const destroyedWindow = createWindow(3, { destroyed: true });
  const prewarmedToastWindow = createWindow(4, { url: 'data:text/html;charset=utf-8,prewarmed-toast' });
  const capturePanelWindow = createWindow(5, { url: 'data:text/html;charset=utf-8,capture-panel' });
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([
    targetWindow,
    senderToastWindow,
    destroyedWindow,
    prewarmedToastWindow,
    capturePanelWindow
  ]);
  const { installGlobalCaptureToastOpenHandler } = await import('./globalClipToastNavigation.js');

  installGlobalCaptureToastOpenHandler();
  const listener = electronMocks.ipcMain.on.mock.calls[0]?.[1];
  listener({ sender: { id: 2 } }, { nodeId: ' node-imported ' });
  await vi.waitFor(() => expect(targetWindow.webContents.send).toHaveBeenCalledTimes(1));

  expect(electronMocks.ipcMain.on).toHaveBeenCalledWith(
    'foliole:global-capture-toast:open',
    expect.any(Function)
  );
  expect(targetWindow.restore).toHaveBeenCalledTimes(1);
  expect(targetWindow.show).toHaveBeenCalledTimes(2);
  expect(targetWindow.maximize).not.toHaveBeenCalled();
  expect(targetWindow.setFullScreen).not.toHaveBeenCalled();
  expect(targetWindow.focus).toHaveBeenCalledTimes(2);
  expect(waitForRendererAppReady).toHaveBeenCalledTimes(1);
  expect(targetWindow.webContents.send).toHaveBeenCalledWith(
    'foliole:global-capture-navigate',
    { nodeId: 'node-imported' }
  );
  expect(senderToastWindow.webContents.send).not.toHaveBeenCalled();
  expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
  expect(prewarmedToastWindow.show).not.toHaveBeenCalled();
  expect(prewarmedToastWindow.webContents.send).not.toHaveBeenCalled();
  expect(capturePanelWindow.show).not.toHaveBeenCalled();
  expect(capturePanelWindow.webContents.send).not.toHaveBeenCalled();
});

it('keeps a maximized app window maximized when opening a clicked toast target', async () => {
  const targetWindow = createWindow(1, { maximized: true });
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([targetWindow]);
  const { openGlobalCaptureTarget } = await import('./globalClipToastNavigation.js');

  openGlobalCaptureTarget('node-imported', 2);

  expect(targetWindow.show).toHaveBeenCalledTimes(1);
  expect(targetWindow.maximize).toHaveBeenCalledTimes(1);
  expect(targetWindow.focus).toHaveBeenCalledTimes(1);
});

it('repairs a maximized app window if the native toast click minimizes it on the next task', async () => {
  vi.useFakeTimers();
  const targetWindow = createWindow(1, { maximized: true });
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([targetWindow]);
  const { openGlobalCaptureTarget } = await import('./globalClipToastNavigation.js');

  openGlobalCaptureTarget('node-imported', 2);
  targetWindow.setMinimizedForTest(true);
  await vi.advanceTimersByTimeAsync(0);

  expect(targetWindow.restore).toHaveBeenCalledTimes(1);
  expect(targetWindow.maximize).toHaveBeenCalledTimes(2);
  expect(targetWindow.focus).toHaveBeenCalledTimes(2);
});

it('keeps a fullscreen app window fullscreen when opening a clicked toast target', async () => {
  const targetWindow = createWindow(1, { fullScreen: true });
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([targetWindow]);
  const { openGlobalCaptureTarget } = await import('./globalClipToastNavigation.js');

  openGlobalCaptureTarget('node-imported', 2);

  expect(targetWindow.show).toHaveBeenCalledTimes(1);
  expect(targetWindow.setFullScreen).toHaveBeenCalledWith(true);
  expect(targetWindow.maximize).not.toHaveBeenCalled();
  expect(targetWindow.focus).toHaveBeenCalledTimes(1);
});

it('waits for the renderer app-ready marker before sending the clicked toast target', async () => {
  let releaseReady: (() => void) | undefined;
  waitForRendererAppReady.mockReturnValue(new Promise<void>((resolve) => {
    releaseReady = resolve;
  }));
  const targetWindow = createWindow(1);
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([targetWindow]);
  const { openGlobalCaptureTarget } = await import('./globalClipToastNavigation.js');

  openGlobalCaptureTarget('node-imported', 2);

  expect(targetWindow.show).toHaveBeenCalledTimes(1);
  expect(targetWindow.focus).toHaveBeenCalledTimes(1);
  expect(targetWindow.webContents.send).not.toHaveBeenCalled();

  releaseReady?.();
  await vi.waitFor(() => expect(targetWindow.webContents.send).toHaveBeenCalledWith(
    'foliole:global-capture-navigate',
    { nodeId: 'node-imported' }
  ));
});

it('sends the clicked toast target after a short timeout when app-ready is not observed', async () => {
  vi.useFakeTimers();
  waitForRendererAppReady.mockReturnValue(new Promise<void>(() => undefined));
  const targetWindow = createWindow(1);
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([targetWindow]);
  const { openGlobalCaptureTarget } = await import('./globalClipToastNavigation.js');

  openGlobalCaptureTarget('node-imported', 2);

  expect(targetWindow.webContents.send).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(300);

  expect(targetWindow.webContents.send).toHaveBeenCalledWith(
    'foliole:global-capture-navigate',
    { nodeId: 'node-imported' }
  );
});
