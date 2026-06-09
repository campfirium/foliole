import { join } from 'node:path';

import { BrowserWindow, ipcMain, screen, type IpcMainEvent } from 'electron';

import {
  GLOBAL_CAPTURE_PANEL_CANCEL_CHANNEL,
  GLOBAL_CAPTURE_PANEL_READY_CHANNEL,
  GLOBAL_CAPTURE_PANEL_RESIZE_CHANNEL,
  GLOBAL_CAPTURE_PANEL_HINT_VISIBLE_CHANNEL,
  GLOBAL_CAPTURE_PANEL_SUBMIT_CHANNEL
} from './globalCaptureChannels.js';
import {
  buildFloatingThemeStyle,
  escapeHtml,
  type GlobalCaptureFloatingTheme,
  resolveFloatingTheme
} from './globalCaptureFloatingSurface.js';
import { isGlobalClipHintVisible, setGlobalClipHintVisible } from './globalClipSettings.js';

export type GlobalCapturePanelResult =
  | { type: 'cancelled' }
  | { type: 'clipboard' }
  | { text: string; type: 'text' };

const PANEL_GUTTER = 26;
const SURFACE_MAX_HEIGHT = 420;
const SURFACE_MIN_HEIGHT = 188;
const SURFACE_WIDTH = 520;
const PANEL_MAX_HEIGHT = SURFACE_MAX_HEIGHT + PANEL_GUTTER * 2;
const PANEL_MIN_HEIGHT = SURFACE_MIN_HEIGHT + PANEL_GUTTER * 2;
const PANEL_HEIGHT = PANEL_MIN_HEIGHT;
const PANEL_WIDTH = SURFACE_WIDTH + PANEL_GUTTER * 2;

let cachedPanelWindow: BrowserWindow | null = null;

function resolvePanelBounds(height: number) {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height: workAreaHeight } = display.workArea;
  return {
    height,
    width: PANEL_WIDTH,
    x: Math.round(x + (width - PANEL_WIDTH) / 2),
    y: Math.round(y + Math.min(workAreaHeight * 0.28, 220))
  };
}

function clampPanelHeight(value: number) {
  return Math.min(Math.max(value, PANEL_MIN_HEIGHT), PANEL_MAX_HEIGHT);
}

function buildPanelHtml(theme: GlobalCaptureFloatingTheme) {
  const chevronDown = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 9 4 4 4-4"/></svg>';
  const chevronRight = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 7 4 5-4 5"/></svg>';
  const html = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<style>',
    buildFloatingThemeStyle(theme),
    'body{padding:26px;}',
    '.panel{display:grid;grid-template-rows:minmax(0,auto) auto;width:520px;min-height:188px;max-height:420px;overflow:hidden;padding:0;}',
    'textarea{box-sizing:border-box;display:block;width:100%;height:144px;min-height:144px;max-height:376px;resize:none;border:0;outline:0;overflow:hidden;background:var(--capture-input-bg);color:var(--capture-fg);font:400 var(--capture-input-font-size)/var(--capture-input-line-height) var(--capture-input-font-family);padding:var(--capture-input-padding-block-start) var(--capture-content-inline-padding) var(--capture-input-padding-block-end);scrollbar-width:none;}',
    'textarea::-webkit-scrollbar{display:none;width:0;height:0;}',
    'textarea::placeholder{color:var(--capture-placeholder);font-weight:400;}',
    '.footer{display:grid;min-height:44px;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;border-top:1px solid var(--capture-divider);padding:6px var(--capture-content-inline-padding);background:transparent;}',
    '.hint{display:flex;min-width:0;align-items:center;gap:4px;overflow:hidden;color:var(--capture-muted);font:400 12px/18px var(--capture-ui-font-family);}',
    '.hint-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.hint-toggle{display:inline-flex;width:14px;height:20px;margin-left:-5px;align-items:center;justify-content:flex-start;border:0;border-radius:4px;background:transparent;color:color-mix(in srgb,var(--capture-muted) 64%,transparent);padding:0;cursor:pointer;}',
    '.hint-toggle:hover{color:var(--capture-fg);background:var(--capture-control-hover-bg);}',
    '.hint-toggle svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}',
    'body[data-hint-visible="false"] .hint-expanded{display:none;}',
    'body[data-hint-visible="true"] .hint-collapsed{display:none;}',
    '.actions{display:flex;align-items:center;gap:8px;}',
    '.primary{min-width:58px;min-height:32px;border:1px solid var(--capture-control-border);border-radius:var(--capture-control-radius);background:transparent;color:var(--capture-control-fg);font:400 13px/18px var(--capture-ui-font-family);padding:5px 14px;cursor:pointer;}',
    '.primary:hover{border-color:var(--capture-control-border-hover);background:var(--capture-control-hover-bg);color:var(--capture-fg);}',
    '</style>',
    `<body data-hint-visible="${theme.hintVisible ? 'true' : 'false'}"><form class="capture-surface panel" id="form"><textarea id="capture" autofocus placeholder="${escapeHtml(theme.strings.placeholder)}"></textarea><div class="footer"><div class="hint"><button aria-expanded="true" aria-label="${escapeHtml(theme.strings.hideHintLabel)}" class="hint-expanded hint-toggle" id="hide-hint" type="button">${chevronDown}</button><span class="hint-expanded hint-text">${escapeHtml(theme.strings.hint)}</span><button aria-expanded="false" aria-label="${escapeHtml(theme.strings.showHintLabel)}" class="hint-collapsed hint-toggle" id="show-hint" type="button">${chevronRight}</button></div><div class="actions"><button class="primary" type="submit">${escapeHtml(theme.strings.save)}</button></div></div></form></body>`
  ].join('');
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function createPanelWindow() {
  const bounds = resolvePanelBounds(PANEL_HEIGHT);
  const panel = new BrowserWindow({
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    focusable: true,
    frame: false,
    height: bounds.height,
    resizable: false,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(process.cwd(), 'electron', 'globalCapturePanelPreload.cjs'),
      sandbox: true
    },
    width: bounds.width,
    x: bounds.x,
    y: bounds.y
  });
  panel.setOpacity(0);
  panel.setIgnoreMouseEvents(true);
  panel.showInactive();
  panel.on('closed', () => {
    if (cachedPanelWindow === panel) cachedPanelWindow = null;
  });
  return panel;
}

function getPanelWindow() {
  if (!cachedPanelWindow || cachedPanelWindow.isDestroyed()) {
    cachedPanelWindow = createPanelWindow();
  }
  return cachedPanelWindow;
}

export function prepareGlobalCapturePanelWindow() {
  getPanelWindow();
}

export function resetGlobalCapturePanelWindowForTests() {
  cachedPanelWindow = null;
}

function revealPanel(panel: BrowserWindow) {
  panel.setIgnoreMouseEvents(false);
  panel.setOpacity(0);
  if (!panel.isVisible()) panel.showInactive();
  panel.setOpacity(1);
  panel.focus();
}

function concealPanel(panel: BrowserWindow) {
  if (panel.isDestroyed()) return;
  panel.setOpacity(0);
  panel.setIgnoreMouseEvents(true);
}

interface PanelIpcHandlers {
  handleCancel: (event: IpcMainEvent) => void;
  handleHintVisible: (event: IpcMainEvent, value: unknown) => void;
  handleReady: (event: IpcMainEvent) => void;
  handleResize: (event: IpcMainEvent, value: unknown) => void;
  handleSubmit: (event: IpcMainEvent, value: unknown) => void;
}

function removePanelIpcListeners(handlers: PanelIpcHandlers) {
  ipcMain.removeListener(GLOBAL_CAPTURE_PANEL_SUBMIT_CHANNEL, handlers.handleSubmit);
  ipcMain.removeListener(GLOBAL_CAPTURE_PANEL_CANCEL_CHANNEL, handlers.handleCancel);
  ipcMain.removeListener(GLOBAL_CAPTURE_PANEL_RESIZE_CHANNEL, handlers.handleResize);
  ipcMain.removeListener(GLOBAL_CAPTURE_PANEL_READY_CHANNEL, handlers.handleReady);
  ipcMain.removeListener(GLOBAL_CAPTURE_PANEL_HINT_VISIBLE_CHANNEL, handlers.handleHintVisible);
}

export function showGlobalCapturePanel(): Promise<GlobalCapturePanelResult> {
  return new Promise((resolve) => {
    const panel = getPanelWindow();
    let loaded = false;
    let ready = false;
    let settled = false;
    let shown = false;
    panel.setBounds(resolvePanelBounds(PANEL_HEIGHT), false);
    concealPanel(panel);
    const showWhenReady = () => {
      if (!loaded || !ready || shown || panel.isDestroyed()) return;
      shown = true;
      revealPanel(panel);
    };
    const settle = (result: GlobalCapturePanelResult) => {
      if (settled) return;
      settled = true;
      removePanelIpcListeners({ handleCancel, handleHintVisible, handleReady, handleResize, handleSubmit });
      concealPanel(panel);
      resolve(result);
    };
    const isPanelSender = (senderId: number) => senderId === panel.webContents.id;
    const handleResize = (event: IpcMainEvent, value: unknown) => {
      if (!isPanelSender(event.sender.id) || typeof value !== 'number') return;
      panel.setBounds(resolvePanelBounds(clampPanelHeight(Math.round(value))), false);
    };
    const handleReady = (event: IpcMainEvent) => {
      if (!isPanelSender(event.sender.id)) return;
      ready = true;
      showWhenReady();
    };
    const handleHintVisible = (event: IpcMainEvent, value: unknown) => {
      if (!isPanelSender(event.sender.id) || typeof value !== 'boolean') return;
      setGlobalClipHintVisible(value);
    };
    const handleSubmit = (event: IpcMainEvent, value: unknown) => {
      if (!isPanelSender(event.sender.id)) return;
      const text = typeof value === 'string' ? value.trim() : '';
      settle(text ? { text, type: 'text' } : { type: 'clipboard' });
    };
    const handleCancel = (event: IpcMainEvent) => {
      if (isPanelSender(event.sender.id)) settle({ type: 'cancelled' });
    };
    ipcMain.on(GLOBAL_CAPTURE_PANEL_SUBMIT_CHANNEL, handleSubmit);
    ipcMain.on(GLOBAL_CAPTURE_PANEL_CANCEL_CHANNEL, handleCancel);
    ipcMain.on(GLOBAL_CAPTURE_PANEL_RESIZE_CHANNEL, handleResize);
    ipcMain.on(GLOBAL_CAPTURE_PANEL_READY_CHANNEL, handleReady);
    ipcMain.on(GLOBAL_CAPTURE_PANEL_HINT_VISIBLE_CHANNEL, handleHintVisible);
    panel.on('closed', () => settle({ type: 'cancelled' }));
    void resolveFloatingTheme(panel).then((theme) =>
      panel.loadURL(buildPanelHtml({ ...theme, hintVisible: isGlobalClipHintVisible() }))
    ).then(() => {
      loaded = true;
      showWhenReady();
    });
  });
}
