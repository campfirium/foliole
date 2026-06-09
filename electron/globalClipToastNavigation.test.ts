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
  minimized: boolean;
}> = {}) {
  return {
    focus: vi.fn(),
    isDestroyed: vi.fn(() => overrides.destroyed ?? false),
    isMinimized: vi.fn(() => overrides.minimized ?? false),
    restore: vi.fn(),
    show: vi.fn(),
    webContents: {
      id,
      send: vi.fn()
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  waitForRendererAppReady.mockResolvedValue(undefined);
});

it('routes a clicked global clip toast to visible main windows only', async () => {
  const targetWindow = createWindow(1, { minimized: true });
  const senderToastWindow = createWindow(2);
  const destroyedWindow = createWindow(3, { destroyed: true });
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([
    targetWindow,
    senderToastWindow,
    destroyedWindow
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
  expect(targetWindow.show).toHaveBeenCalledTimes(1);
  expect(targetWindow.focus).toHaveBeenCalledTimes(1);
  expect(waitForRendererAppReady).toHaveBeenCalledTimes(1);
  expect(targetWindow.webContents.send).toHaveBeenCalledWith(
    'foliole:global-capture-navigate',
    { nodeId: 'node-imported' }
  );
  expect(senderToastWindow.webContents.send).not.toHaveBeenCalled();
  expect(destroyedWindow.webContents.send).not.toHaveBeenCalled();
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
