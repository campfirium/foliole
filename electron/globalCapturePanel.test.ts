// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const clipSettingsMocks = vi.hoisted(() => ({
  isGlobalClipHintVisible: vi.fn(() => true),
  setGlobalClipHintVisible: vi.fn()
}));

const { electronMocks, panelWindow } = vi.hoisted(() => {
  const ipcHandlers = new Map<string, (...args: unknown[]) => void>();
  const webContents = {
    executeJavaScript: vi.fn(async () => ({
      accent: 'rgb(127, 177, 141)',
      actionForeground: 'rgba(232, 230, 223, 0.62)',
      actionHoverBackground: 'rgba(232, 230, 223, 0.06)',
      actionHoverForeground: 'rgba(232, 230, 223, 0.78)',
      background: 'rgb(42, 45, 41)', border: 'rgb(80, 84, 78)',
      controlForeground: 'rgba(232, 230, 223, 0.58)', controlRadius: '8px',
      contentInlinePadding: '26px',
      divider: 'rgba(232, 230, 223, 0.10)',
      foreground: 'rgb(232, 230, 223)',
      hasAppTheme: true,
      inputBackground: 'rgb(36, 39, 35)', inputPaddingBlockEnd: '12px', inputPaddingBlockStart: '24px',
      mutedForeground: 'rgb(165, 164, 159)',
      strings: { hideHint: '×', hideHintLabel: '隐藏提示', hint: '回车保存，空白时导入剪贴板', placeholder: '...', save: '保存', showHint: '?', showHintLabel: '显示提示' }
    })),
    id: 11
  };
  const appWindows = vi.fn<() => Array<{
    isDestroyed: () => boolean;
    webContents: typeof webContents;
  }>>(() => []);
  const window = {
    close: vi.fn(),
    focus: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    loadURL: vi.fn<(url: string) => Promise<void>>(async () => undefined),
    on: vi.fn(),
    setBounds: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setOpacity: vi.fn(),
    showInactive: vi.fn(),
    webContents
  };
  return {
    electronMocks: {
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

import { resetGlobalCapturePanelWindowForTests, showGlobalCapturePanel } from './globalCapturePanel.js';

async function waitForPanelLoad() {
  for (let index = 0; index < 10 && panelWindow.loadURL.mock.calls.length === 0; index += 1) {
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
  panelWindow.isDestroyed.mockReturnValue(false);
  panelWindow.isVisible.mockReturnValue(true);
});

it('shows a compact shell-less capture panel with an isolated preload', async () => {
  const promise = showGlobalCapturePanel();
  await waitForPanelLoad();

  expect(electronMocks.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
    backgroundColor: '#00000000',
    height: 240,
    width: 572,
    webPreferences: expect.objectContaining({
      contextIsolation: true,
      nodeIntegration: false,
      preload: expect.stringContaining('globalCapturePanelPreload.cjs'),
      sandbox: true
    })
  }));
  expect(panelWindow.showInactive).toHaveBeenCalledTimes(1);
  expect(panelWindow.setOpacity).toHaveBeenCalledWith(0);
  expect(panelWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
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

  panelWindow.emitCancel();
  await expect(promise).resolves.toEqual({ type: 'cancelled' });
});

it('waits for the panel layout before revealing the prewarmed window', async () => {
  const promise = showGlobalCapturePanel();
  await waitForPanelLoad();

  expect(panelWindow.focus).not.toHaveBeenCalled();
  panelWindow.emitReady();
  await waitForPanelReveal();
  expect(panelWindow.focus).toHaveBeenCalledTimes(1);
  expect(panelWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
  expect(panelWindow.setOpacity).toHaveBeenLastCalledWith(1);

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

it('uses the current app floating theme for the capture panel', async () => {
  electronMocks.BrowserWindow.getAllWindows.mockReturnValue([{
    isDestroyed: vi.fn(() => false),
    webContents: panelWindow.webContents
  }]);

  const promise = showGlobalCapturePanel();
  await waitForPanelLoad();

  const latestCall = panelWindow.loadURL.mock.calls.at(-1);
  const loadedUrl = typeof latestCall?.[0] === 'string' ? latestCall[0] : '';
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-bg:rgb(42, 45, 41);');
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-fg:rgb(232, 230, 223);');
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-action-fg:rgba(232, 230, 223, 0.62);');
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-control-fg:rgba(232, 230, 223, 0.58);');
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-control-radius:8px;');
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-content-inline-padding:26px;');
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-input-padding-block-start:24px;');
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-input-padding-block-end:12px;');
  expect(decodeURIComponent(loadedUrl)).toContain('--capture-divider:rgba(232, 230, 223, 0.10);');
  expect(decodeURIComponent(loadedUrl)).toContain('回车保存，空白时导入剪贴板');
  expect(decodeURIComponent(loadedUrl)).toContain('aria-label="隐藏提示"');
  expect(decodeURIComponent(loadedUrl)).toContain('aria-expanded="true"');
  expect(decodeURIComponent(loadedUrl)).toContain('<path d="m8 9 4 4 4-4"/>');
  expect(decodeURIComponent(loadedUrl)).toContain('</button><span class="hint-expanded hint-text">回车保存，空白时导入剪贴板</span>');
  expect(decodeURIComponent(loadedUrl)).toContain('placeholder="..."');
  expect(decodeURIComponent(loadedUrl)).toContain('>保存<');
  expect(decodeURIComponent(loadedUrl)).not.toContain('Capture a thought');
  expect(decodeURIComponent(loadedUrl)).not.toContain('Enter saves');
  expect(decodeURIComponent(loadedUrl)).not.toContain('>Save<');
  panelWindow.emitCancel();
  await expect(promise).resolves.toEqual({ type: 'cancelled' });
});

it('keeps capture shell-less without old dialog chrome', async () => {
  const promise = showGlobalCapturePanel();
  await waitForPanelLoad();

  const latestCall = panelWindow.loadURL.mock.calls.at(-1);
  const loadedUrl = typeof latestCall?.[0] === 'string' ? latestCall[0] : '';
  const html = decodeURIComponent(loadedUrl);
  expect(html).not.toContain('Capture to Inbox');
  expect(html).not.toContain('class="bar"');
  expect(html).not.toContain('id="capture-title"');
  expect(html).not.toContain('capture-help');
  expect(html).not.toContain('Tips');
  expect(html).not.toContain('Hide tips');
  expect(html).toContain('Enter saves. Empty input imports the clipboard.');
  expect(html).toContain('aria-label="Hide shortcut hint"');
  expect(html).toContain('aria-label="Show shortcut hint"');
  expect(html).toContain('placeholder="..."');
  expect(html).toContain('>Save<');
  expect(html).toContain('font:400 var(--capture-input-font-size)/var(--capture-input-line-height) var(--capture-input-font-family)');
  expect(html).not.toContain('var(--capture-accent) 8%');
  panelWindow.emitCancel();
  await expect(promise).resolves.toEqual({ type: 'cancelled' });
});
