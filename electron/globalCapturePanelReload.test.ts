// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const clipSettingsMocks = vi.hoisted(() => ({
  isGlobalClipHintVisible: vi.fn(() => true),
  setGlobalClipHintVisible: vi.fn()
}));

const { chineseDarkTheme, englishTheme } = vi.hoisted(() => {
  const englishTheme = () => ({
    accent: 'rgb(52, 119, 91)', actionForeground: 'rgba(28, 31, 30, 0.64)',
    actionHoverBackground: 'rgba(28, 31, 30, 0.06)', actionHoverForeground: 'rgba(28, 31, 30, 0.8)',
    background: 'rgb(252, 251, 248)', border: 'rgb(210, 209, 203)',
    controlForeground: 'rgba(28, 31, 30, 0.62)', controlRadius: '8px',
    contentInlinePadding: '26px', divider: 'rgba(28, 31, 30, 0.12)', foreground: 'rgb(28, 31, 30)',
    hasAppTheme: true,
    inputBackground: 'rgb(255, 255, 255)', inputPaddingBlockEnd: '12px', inputPaddingBlockStart: '24px',
    mutedForeground: 'rgb(124, 123, 118)',
    strings: {
      hideHint: '×', hideHintLabel: 'Hide shortcut hint', hint: 'Enter saves. Empty input imports the clipboard.',
      placeholder: '...', save: 'Save', showHint: '?', showHintLabel: 'Show shortcut hint'
    }
  });
  const chineseDarkTheme = () => ({
    ...englishTheme(),
    actionForeground: 'rgba(232, 230, 223, 0.62)', actionHoverBackground: 'rgba(232, 230, 223, 0.06)',
    actionHoverForeground: 'rgba(232, 230, 223, 0.78)', background: 'rgb(42, 45, 41)',
    border: 'rgb(80, 84, 78)', controlForeground: 'rgba(232, 230, 223, 0.58)',
    divider: 'rgba(232, 230, 223, 0.10)', foreground: 'rgb(232, 230, 223)',
    inputBackground: 'rgb(36, 39, 35)', mutedForeground: 'rgb(165, 164, 159)',
    strings: {
      hideHint: '×', hideHintLabel: '隐藏提示', hint: '回车保存，空白时导入剪贴板',
      placeholder: '...', save: '保存', showHint: '?', showHintLabel: '显示提示'
    }
  });
  return { chineseDarkTheme, englishTheme };
});

const { electronMocks, panelWindow } = vi.hoisted(() => {
  const ipcHandlers = new Map<string, (...args: unknown[]) => void>();
  let theme = englishTheme();
  const webContents = { executeJavaScript: vi.fn(async () => theme), focus: vi.fn(), id: 11, on: vi.fn(), send: vi.fn() };
  const window = {
    close: vi.fn(), focus: vi.fn(), getParentWindow: vi.fn(() => null), isDestroyed: vi.fn(() => false), isMinimized: vi.fn(() => false), isVisible: vi.fn(() => true),
    loadURL: vi.fn<(url: string) => Promise<void>>(async () => undefined),
    moveTop: vi.fn(), on: vi.fn(), setAlwaysOnTop: vi.fn(), setBounds: vi.fn(), setIgnoreMouseEvents: vi.fn(), setOpacity: vi.fn(), setParentWindow: vi.fn(), showInactive: vi.fn(),
    webContents
  };
  return {
    electronMocks: {
      app: { getAppPath: vi.fn(() => '/app') }, BrowserWindow: Object.assign(vi.fn(function BrowserWindow() {
        return window;
      }), {
        getAllWindows: vi.fn(() => [{ isDestroyed: vi.fn(() => false), isMinimized: vi.fn(() => false), isVisible: vi.fn(() => true), webContents }]),
        getFocusedWindow: vi.fn(() => null)
      }),
      ipcMain: {
        on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => ipcHandlers.set(channel, handler)),
        removeListener: vi.fn()
      },
      screen: { getPrimaryDisplay: vi.fn(() => ({ workArea: { height: 900, width: 1400, x: 0, y: 0 } })) }
    },
    panelWindow: {
      ...window,
      emitCancel: () => ipcHandlers.get('foliole:global-capture-panel:cancel')?.({ sender: { id: 11 } }),
      emitReady: () => ipcHandlers.get('foliole:global-capture-panel:ready')?.({ sender: { id: 11 } }),
      setChineseDarkTheme: () => {
        theme = chineseDarkTheme();
      },
      setEnglishTheme: () => {
        theme = englishTheme();
      }
    }
  };
});

vi.mock('electron', () => electronMocks);
vi.mock('./globalClipSettings.js', () => clipSettingsMocks);

import { resetGlobalCapturePanelWindowForTests, showGlobalCapturePanel } from './globalCapturePanel.js';

async function waitForPanelLoadCount(count: number) {
  for (let index = 0; index < 30 && panelWindow.loadURL.mock.calls.length < count; index += 1) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetGlobalCapturePanelWindowForTests();
  panelWindow.setEnglishTheme();
});

it('reloads current theme and language each time the reused capture panel opens', async () => {
  const firstPromise = showGlobalCapturePanel();
  await waitForPanelLoadCount(1);
  panelWindow.emitReady();
  panelWindow.emitCancel();
  await expect(firstPromise).resolves.toEqual({ type: 'cancelled' });
  expect(decodeURIComponent(panelWindow.loadURL.mock.calls.at(-1)?.[0] ?? '')).toContain('>Save<');

  panelWindow.setChineseDarkTheme();
  const loadCountBeforeSecondOpen = panelWindow.loadURL.mock.calls.length;
  const secondPromise = showGlobalCapturePanel();
  await waitForPanelLoadCount(loadCountBeforeSecondOpen + 1);
  const secondHtml = decodeURIComponent(panelWindow.loadURL.mock.calls.at(-1)?.[0] ?? '');
  expect(secondHtml).toContain('--capture-bg:rgb(42, 45, 41);');
  expect(secondHtml).toContain('回车保存，空白时导入剪贴板');
  expect(secondHtml).toContain('aria-label="隐藏提示"');
  expect(secondHtml).toContain('>保存<');
  expect(secondHtml).not.toContain('>Save<');
  panelWindow.emitReady();
  panelWindow.emitCancel();
  await expect(secondPromise).resolves.toEqual({ type: 'cancelled' });
});

it('keeps capture shell-less without old dialog chrome', async () => {
  const promise = showGlobalCapturePanel();
  await waitForPanelLoadCount(1);

  const html = decodeURIComponent(panelWindow.loadURL.mock.calls.at(-1)?.[0] ?? '');
  expect(html).not.toContain('Capture to Inbox');
  expect(html).not.toContain('class="bar"');
  expect(html).not.toContain('id="capture-title"');
  expect(html).not.toContain('capture-help');
  expect(html).toContain('Enter saves. Empty input imports the clipboard.');
  expect(html).toContain('aria-label="Hide shortcut hint"');
  expect(html).toContain('placeholder="..."');
  expect(html).toContain('>Save<');
  expect(html).toContain('html,body{height:100%;}');
  expect(html).toContain('body{box-sizing:border-box;padding:26px;-webkit-app-region:drag;app-region:drag;}');
  expect(html).toContain('.panel{position:relative;display:grid;grid-template-rows:minmax(0,auto) auto;width:520px;min-height:188px;max-height:420px;overflow:hidden;padding:0;-webkit-app-region:no-drag;app-region:no-drag;}');
  expect(html).not.toContain('drag-strip');
  expect(html).not.toContain('cursor:grab');
  expect(html).not.toContain('cursor:grabbing');
  expect(html).toContain('textarea{box-sizing:border-box;display:block;width:100%;height:144px;min-height:144px;max-height:376px;resize:none;');
  expect(html).toContain('scrollbar-width:none;-webkit-app-region:no-drag;app-region:no-drag;}');
  expect(html).toContain('.footer{display:grid;min-height:44px;grid-template-columns:minmax(0,1fr) auto;');
  expect(html).toContain('background:transparent;-webkit-app-region:no-drag;app-region:no-drag;}');
  expect(html).toContain('.hint-toggle{display:inline-flex;width:22px;height:22px;');
  expect(html).toContain('cursor:pointer;-webkit-app-region:no-drag;app-region:no-drag;}');
  expect(html).toContain('.primary{min-width:58px;min-height:32px;');
  expect(html).toContain('cursor:pointer;-webkit-app-region:no-drag;app-region:no-drag;}');
  expect(html).toContain('font:400 var(--capture-input-font-size)/var(--capture-input-line-height) var(--capture-input-font-family)');
  expect(html).not.toContain('var(--capture-accent) 8%');
  panelWindow.emitCancel();
  await expect(promise).resolves.toEqual({ type: 'cancelled' });
});
