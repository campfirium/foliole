// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const clipSettingsMocks = vi.hoisted(() => ({
  isGlobalClipHintVisible: vi.fn(() => true),
  setGlobalClipHintVisible: vi.fn()
}));

const { electronMocks, panelWindow } = vi.hoisted(() => {
  const ipcHandlers = new Map<string, (...args: unknown[]) => void>();
  const webContents = {
    executeJavaScript: vi.fn(async () => undefined),
    focus: vi.fn(), id: 11, on: vi.fn(), send: vi.fn()
  };
  const appWindows = vi.fn(() => []);
  const window = {
    close: vi.fn(), focus: vi.fn(),
    getParentWindow: vi.fn(() => null),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    loadURL: vi.fn<(url: string) => Promise<void>>(async () => undefined),
    moveTop: vi.fn(),
    on: vi.fn(),
    setBackgroundColor: vi.fn(), setBounds: vi.fn(),
    setAlwaysOnTop: vi.fn(), setIgnoreMouseEvents: vi.fn(), setOpacity: vi.fn(), setParentWindow: vi.fn(), showInactive: vi.fn(),
    webContents
  };
  return {
    electronMocks: {
      app: { getAppPath: vi.fn(() => '/app') },
      BrowserWindow: Object.assign(vi.fn(function BrowserWindow() {
        return window;
      }), { getAllWindows: appWindows }),
      ipcMain: {
        on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
          ipcHandlers.set(channel, handler);
        }),
        removeListener: vi.fn()
      },
      screen: { getPrimaryDisplay: vi.fn(() => ({ workArea: { height: 900, width: 1400, x: 0, y: 0 } })) }
    },
    panelWindow: {
      ...window,
      emitCancel: () => ipcHandlers.get('foliole:global-capture-panel:cancel')?.({ sender: { id: 11 } }),
      emitHintVisible: (value: boolean) => ipcHandlers.get('foliole:global-capture-panel:hint-visible')?.({ sender: { id: 11 } }, value),
      emitReady: () => ipcHandlers.get('foliole:global-capture-panel:ready')?.({ sender: { id: 11 } }),
      emitResize: (value: number) => ipcHandlers.get('foliole:global-capture-panel:resize')?.({ sender: { id: 11 } }, value),
      emitSubmit: (value: string) => ipcHandlers.get('foliole:global-capture-panel:submit')?.({ sender: { id: 11 } }, value)
    }
  };
});

vi.mock('electron', () => electronMocks);
vi.mock('./globalClipSettings.js', () => clipSettingsMocks);

import { raiseGlobalCapturePanelWindow, resetGlobalCapturePanelWindowForTests, showGlobalCapturePanel } from './globalCapturePanel.js';

async function waitForPanelLoad() {
  for (let index = 0; index < 30 && panelWindow.loadURL.mock.calls.length === 0; index += 1) {
    await Promise.resolve();
  }
}

async function waitForPanelReveal() {
  for (let index = 0; index < 10 && panelWindow.focus.mock.calls.length === 0; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetGlobalCapturePanelWindowForTests();
  clipSettingsMocks.isGlobalClipHintVisible.mockReturnValue(true);
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([]);
  panelWindow.getParentWindow.mockReturnValue(null);
  panelWindow.isDestroyed.mockReturnValue(false);
  panelWindow.isMinimized.mockReturnValue(false);
  panelWindow.isVisible.mockReturnValue(true);
});

it('shows a compact shell-less capture panel with an isolated preload', async () => {
  const promise = showGlobalCapturePanel();
  await waitForPanelLoad();

  expect(electronMocks.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
    backgroundColor: '#00000000',
    height: 240,
    transparent: true,
    width: 572,
    webPreferences: expect.objectContaining({
      contextIsolation: true,
      nodeIntegration: false,
      preload: expect.stringMatching(/[\\/]app[\\/]electron[\\/]globalCapturePanelPreload\.cjs$/u),
      sandbox: true
    })
  }));
  const panelOptions = (electronMocks.BrowserWindow.mock.calls[0] as unknown[] | undefined)?.[0];
  expect(panelOptions).not.toHaveProperty('alwaysOnTop');
  expect(panelOptions).toMatchObject({ show: false, skipTaskbar: true });
  expect(panelWindow.showInactive).not.toHaveBeenCalled();
  expect(panelWindow.setOpacity).toHaveBeenCalledWith(0);
  expect(panelWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
  panelWindow.isVisible.mockReturnValue(false);
  panelWindow.emitReady();
  await waitForPanelReveal();
  expect(panelWindow.showInactive).toHaveBeenCalledTimes(1);
  panelWindow.emitCancel();
  await expect(promise).resolves.toEqual({ type: 'cancelled' });
});

it('persists hint visibility changes from the capture panel', async () => {
  const promise = showGlobalCapturePanel();
  await waitForPanelLoad();

  panelWindow.emitHintVisible(false);
  panelWindow.emitHintVisible(true);

  expect(clipSettingsMocks.setGlobalClipHintVisible).toHaveBeenNthCalledWith(1, false);
  expect(clipSettingsMocks.setGlobalClipHintVisible).toHaveBeenNthCalledWith(2, true);

  panelWindow.emitCancel();
  await expect(promise).resolves.toEqual({ type: 'cancelled' });
});

it('renders the collapsed hint state from persisted settings', async () => {
  clipSettingsMocks.isGlobalClipHintVisible.mockReturnValue(false);

  const promise = showGlobalCapturePanel();
  await waitForPanelLoad();

  const loadedUrl = panelWindow.loadURL.mock.calls.at(-1)?.[0] ?? '';
  const html = decodeURIComponent(loadedUrl);
  expect(html).toContain('data-hint-visible="false"');
  expect(html).toContain('aria-label="Show shortcut hint"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('<path d="m8 7 4 5-4 5"/>');
  expect(html).toContain('.hint-toggle svg{width:18px;height:18px;');
  expect(html).toContain('stroke-width:2;');
  expect(html).not.toContain('stroke-width:2.2;');
  expect(html).not.toContain('>?</button>');

  panelWindow.emitCancel();
  await expect(promise).resolves.toEqual({ type: 'cancelled' });
});

it('waits for panel readiness before reveal and focuses its web contents', async () => {
  const promise = showGlobalCapturePanel();
  await waitForPanelLoad();

  expect(panelWindow.focus).not.toHaveBeenCalled();
  panelWindow.moveTop.mockClear();
  panelWindow.setAlwaysOnTop.mockClear();
  panelWindow.setParentWindow.mockClear();
  panelWindow.emitReady();
  await waitForPanelReveal();
  expect(panelWindow.focus).toHaveBeenCalledTimes(1);
  expect(panelWindow.webContents.focus).toHaveBeenCalledTimes(1);
  expect(panelWindow.webContents.send).toHaveBeenCalledWith('foliole:global-capture-panel:focus');
  expect(panelWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
  expect(panelWindow.setOpacity).toHaveBeenLastCalledWith(1);
  expect(panelWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(1, true);
  expect(panelWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(2, false);
  expect(panelWindow.moveTop).toHaveBeenCalledTimes(2);
  expect(panelWindow.setAlwaysOnTop.mock.invocationCallOrder[0]!).toBeLessThan(panelWindow.focus.mock.invocationCallOrder[0]!);
  expect(panelWindow.focus.mock.invocationCallOrder[0]!).toBeLessThan(panelWindow.setAlwaysOnTop.mock.invocationCallOrder[1]!);
  expect(panelWindow.setAlwaysOnTop.mock.invocationCallOrder[1]!).toBeLessThan(panelWindow.moveTop.mock.invocationCallOrder[1]!);
  expect(panelWindow.setParentWindow).not.toHaveBeenCalled();

  panelWindow.emitCancel();
  await expect(promise).resolves.toEqual({ type: 'cancelled' });
  expect(panelWindow.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
  expect(panelWindow.setParentWindow).not.toHaveBeenCalled();
});

it('raises an already open panel without resetting the capture input', async () => {
  const promise = showGlobalCapturePanel();
  await waitForPanelLoad();
  panelWindow.emitReady();
  await waitForPanelReveal();
  panelWindow.focus.mockClear();
  panelWindow.moveTop.mockClear();
  panelWindow.setAlwaysOnTop.mockClear();
  panelWindow.webContents.focus.mockClear();
  panelWindow.webContents.send.mockClear();

  expect(raiseGlobalCapturePanelWindow()).toBe(true);

  expect(panelWindow.focus).toHaveBeenCalledTimes(1);
  expect(panelWindow.webContents.focus).toHaveBeenCalledTimes(1);
  expect(panelWindow.webContents.send).not.toHaveBeenCalled();
  expect(panelWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(1, true);
  expect(panelWindow.setAlwaysOnTop).toHaveBeenNthCalledWith(2, false);
  expect(panelWindow.moveTop).toHaveBeenCalledTimes(2);

  panelWindow.emitCancel();
  await expect(promise).resolves.toEqual({ type: 'cancelled' });
});

it('settles text, clipboard, and cancel actions from panel ipc', async () => {
  const textPromise = showGlobalCapturePanel();
  panelWindow.emitSubmit('quick thought');
  await expect(textPromise).resolves.toEqual({ text: 'quick thought', type: 'text' });

  const clipboardPromise = showGlobalCapturePanel();
  panelWindow.emitSubmit('  ');
  await expect(clipboardPromise).resolves.toEqual({ type: 'clipboard' });

  const cancelPromise = showGlobalCapturePanel();
  panelWindow.emitCancel();
  await expect(cancelPromise).resolves.toEqual({ type: 'cancelled' });
});

it('clamps auto-grow resize requests from the panel sender', async () => {
  const promise = showGlobalCapturePanel();
  await waitForPanelLoad();
  panelWindow.setBounds.mockClear();

  panelWindow.emitResize(180);
  panelWindow.emitResize(300);
  panelWindow.emitResize(500);

  expect(panelWindow.setBounds).toHaveBeenNthCalledWith(1, { height: 240, width: 572, x: 414, y: 220 }, false);
  expect(panelWindow.setBounds).toHaveBeenNthCalledWith(2, { height: 300, width: 572, x: 414, y: 220 }, false);
  expect(panelWindow.setBounds).toHaveBeenNthCalledWith(3, { height: 472, width: 572, x: 414, y: 220 }, false);

  panelWindow.emitCancel();
  await expect(promise).resolves.toEqual({ type: 'cancelled' });
});
