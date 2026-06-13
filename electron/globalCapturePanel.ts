import { BrowserWindow, ipcMain, screen, type IpcMainEvent } from 'electron';

import {
  GLOBAL_CAPTURE_PANEL_CANCEL_CHANNEL,
  GLOBAL_CAPTURE_PANEL_FOCUS_CHANNEL,
  GLOBAL_CAPTURE_PANEL_READY_CHANNEL,
  GLOBAL_CAPTURE_PANEL_RESIZE_CHANNEL,
  GLOBAL_CAPTURE_PANEL_HINT_VISIBLE_CHANNEL,
  GLOBAL_CAPTURE_PANEL_SUBMIT_CHANNEL
} from './globalCaptureChannels.js';
import { resolveFloatingTheme } from './globalCaptureFloatingSurface.js';
import { bindGlobalCapturePanelDrag } from './globalCapturePanelDrag.js';
import { buildGlobalCapturePanelHtml } from './globalCapturePanelHtml.js';
import { installGlobalCapturePanelTestHook } from './globalCapturePanelTestHook.js';
import { resolveGlobalCapturePreloadPath } from './globalCapturePreloadPath.js';
import { isGlobalClipHintVisible, setGlobalClipHintVisible } from './globalClipSettings.js';

export type GlobalCapturePanelResult = { type: 'cancelled' } | { type: 'clipboard' } | { text: string; type: 'text' };

const PANEL_GUTTER = 26;
const SURFACE_MAX_HEIGHT = 420;
const SURFACE_MIN_HEIGHT = 188;
const SURFACE_WIDTH = 520;
const PANEL_MAX_HEIGHT = SURFACE_MAX_HEIGHT + PANEL_GUTTER * 2;
const PANEL_MIN_HEIGHT = SURFACE_MIN_HEIGHT + PANEL_GUTTER * 2;
const PANEL_WIDTH = SURFACE_WIDTH + PANEL_GUTTER * 2;
let cachedPanelWindow: BrowserWindow | null = null;
let cachedPanelLoad: Promise<void> | null = null;
let cachedPanelReady = false;
let cachedPanelLoadVersion = 0;

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

function createPanelWindow() {
  const bounds = resolvePanelBounds(PANEL_MIN_HEIGHT);
  const panel = new BrowserWindow({
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
      preload: resolveGlobalCapturePreloadPath('globalCapturePanelPreload.cjs'),
      sandbox: true
    },
    width: bounds.width,
    x: bounds.x,
    y: bounds.y
  });
  panel.setOpacity(0);
  panel.setIgnoreMouseEvents(true);
  panel.showInactive();
  bindGlobalCapturePanelDrag(panel);
  const handlePanelReady = (event: IpcMainEvent) => {
    if (event.sender.id === panel.webContents.id) cachedPanelReady = true;
  };
  ipcMain.on(GLOBAL_CAPTURE_PANEL_READY_CHANNEL, handlePanelReady);
  panel.on('closed', () => {
    if (cachedPanelWindow === panel) {
      cachedPanelWindow = null;
      cachedPanelLoad = null;
      cachedPanelReady = false;
    }
    ipcMain.removeListener(GLOBAL_CAPTURE_PANEL_READY_CHANNEL, handlePanelReady);
  });
  return panel;
}

function loadPanelWindow(panel: BrowserWindow, forceReload = false) {
  if (!cachedPanelLoad || forceReload) {
    const loadVersion = cachedPanelLoadVersion += 1;
    cachedPanelReady = false;
    cachedPanelLoad = resolveFloatingTheme(panel)
      .then((theme) => {
        if (loadVersion !== cachedPanelLoadVersion || panel.isDestroyed()) return undefined;
        return panel.loadURL(buildGlobalCapturePanelHtml({ ...theme, hintVisible: isGlobalClipHintVisible() }));
      })
      .then(() => undefined);
  }
  return cachedPanelLoad;
}

function getPanelWindow() {
  if (!cachedPanelWindow || cachedPanelWindow.isDestroyed()) {
    cachedPanelWindow = createPanelWindow();
  }
  return cachedPanelWindow;
}

export function prepareGlobalCapturePanelWindow() {
  void loadPanelWindow(getPanelWindow());
}

export function resetGlobalCapturePanelWindowForTests() {
  cachedPanelWindow = null;
  cachedPanelLoad = null;
  cachedPanelReady = false;
  cachedPanelLoadVersion += 1;
}

function raisePanelWindow(panel: BrowserWindow, sendFocusRequest: boolean) {
  panel.setIgnoreMouseEvents(false);
  if (!panel.isVisible()) panel.showInactive();
  panel.setOpacity(1);
  panel.setAlwaysOnTop(true);
  panel.moveTop();
  panel.focus();
  panel.webContents.focus();
  if (sendFocusRequest) panel.webContents.send(GLOBAL_CAPTURE_PANEL_FOCUS_CHANNEL);
  panel.setAlwaysOnTop(false);
  panel.moveTop();
}

function revealPanel(panel: BrowserWindow) {
  panel.setOpacity(0);
  raisePanelWindow(panel, true);
}

export function raiseGlobalCapturePanelWindow() {
  if (!cachedPanelReady || !cachedPanelWindow || cachedPanelWindow.isDestroyed()) return false;
  raisePanelWindow(cachedPanelWindow, false);
  return true;
}

function concealPanel(panel: BrowserWindow) {
  if (panel.isDestroyed()) return;
  panel.setOpacity(0);
  panel.setIgnoreMouseEvents(true);
  panel.setAlwaysOnTop(false);
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
    let settled = false;
    let shown = false;
    panel.setBounds(resolvePanelBounds(PANEL_MIN_HEIGHT), false);
    concealPanel(panel);
    const showWhenReady = () => {
      if (!cachedPanelReady) return;
      if (shown || settled || panel.isDestroyed()) return;
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
      cachedPanelReady = true;
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
    void loadPanelWindow(panel, true).then(showWhenReady);
  });
}

installGlobalCapturePanelTestHook(showGlobalCapturePanel);
