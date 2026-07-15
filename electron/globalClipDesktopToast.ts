import { BrowserWindow, screen } from 'electron';

import { GLOBAL_CAPTURE_TOAST_TARGET_CHANNEL } from './globalCaptureChannels.js';
import { type GlobalCaptureFloatingTheme, resolveFloatingTheme } from './globalCaptureFloatingSurface.js';
import { resolveGlobalCapturePreloadPath } from './globalCapturePreloadPath.js';
import { resolveGlobalClipToastPoint } from './globalClipDesktopToastPosition.js';
import {
  prepareGlobalClipDesktopToastWindow as preparePrewarmedToastWindow,
  resetGlobalClipDesktopToastWindowForTests as resetPrewarmedToastWindowForTests,
  takePreparedGlobalClipDesktopToastWindow
} from './globalClipDesktopToastPrewarm.js';
import {
  resolveToastDisplayMs,
  type GlobalClipDesktopToast,
  type GlobalClipToastLocale,
  type GlobalClipToastStatus
} from './globalClipDesktopToastState.js';
import { installGlobalClipDesktopToastTestHook } from './globalClipDesktopToastTestHook.js';
import { refreshToastWindowTheme } from './globalClipDesktopToastTheme.js';
import { buildToastHtml, buildToastUpdateScript } from './globalClipDesktopToastView.js';
import { getGlobalClipToastPosition } from './globalClipSettings.js';
import { installGlobalCaptureToastOpenHandler, openGlobalCaptureTarget } from './globalClipToastNavigation.js';

const TOAST_GUTTER = 22;
const TOAST_HEIGHT = 72;
const TOAST_MARGIN = 18;
const TOAST_WIDTH = 340;
const TOAST_WINDOW_HEIGHT = TOAST_HEIGHT + TOAST_GUTTER * 2;
const TOAST_WINDOW_WIDTH = TOAST_WIDTH + TOAST_GUTTER * 2;
const WM_LBUTTONUP = 0x0202;

function closeToastAfterDisplay(toastWindow: BrowserWindow, status: GlobalClipToastStatus) {
  if (status === 'pending') {
    return;
  }
  globalThis.setTimeout(() => {
    if (!toastWindow.isDestroyed()) {
      toastWindow.close();
    }
  }, resolveToastDisplayMs(status));
}

function createToastWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const toastWindow = new BrowserWindow({
    alwaysOnTop: true,
    acceptFirstMouse: process.platform === 'darwin',
    backgroundColor: '#00000000',
    focusable: true,
    frame: false,
    height: TOAST_WINDOW_HEIGHT,
    resizable: false,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: resolveGlobalCapturePreloadPath('globalCaptureToastPreload.cjs'),
      sandbox: true
    },
    width: TOAST_WINDOW_WIDTH,
    x: x + width - TOAST_WIDTH - TOAST_MARGIN - TOAST_GUTTER,
    y: y + height - TOAST_HEIGHT - TOAST_MARGIN - TOAST_GUTTER
  });
  toastWindow.setAlwaysOnTop(true, 'screen-saver');
  toastWindow.setIgnoreMouseEvents(false);
  return toastWindow;
}

function positionToastForDisplay(toastWindow: BrowserWindow) {
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const position = resolveGlobalClipToastPoint({
    gutter: TOAST_GUTTER,
    margin: TOAST_MARGIN,
    position: getGlobalClipToastPosition(),
    toastHeight: TOAST_HEIGHT,
    toastWidth: TOAST_WIDTH,
    workArea: display.workArea
  });
  toastWindow.setPosition(position.x, position.y, false);
}

function loadToastWindow(toastWindow: BrowserWindow, status: GlobalClipToastStatus) {
  return resolveFloatingTheme(toastWindow)
    .then((theme) => toastWindow.loadURL(buildToastHtml(theme, status)).then(() => theme));
}

function resolveToastWindowForDisplay(
  toastWindow: BrowserWindow,
  preparedLoad: Promise<GlobalCaptureFloatingTheme> | undefined,
  status: GlobalClipToastStatus
) {
  if (preparedLoad) {
    return preparedLoad.then(() => refreshToastWindowTheme(toastWindow));
  }
  return loadToastWindow(toastWindow, status);
}

export function prepareGlobalClipDesktopToastWindow() {
  preparePrewarmedToastWindow(createToastWindow, loadToastWindow);
}

export function resetGlobalClipDesktopToastWindowForTests() {
  resetPrewarmedToastWindowForTests();
}

function openToastTarget(toastWindow: BrowserWindow, targetNodeId: string | null) {
  if (!targetNodeId || toastWindow.isDestroyed()) {
    return;
  }
  const senderId = toastWindow.webContents.id;
  toastWindow.once('closed', () => {
    void openGlobalCaptureTarget(targetNodeId, senderId);
  });
  toastWindow.close();
}

export function showGlobalClipDesktopToast(status: GlobalClipToastStatus = 'success'): GlobalClipDesktopToast {
  installGlobalCaptureToastOpenHandler();
  const prepared = takePreparedGlobalClipDesktopToastWindow();
  const toastWindow = prepared?.window ?? createToastWindow();
  let currentStatus = status;
  let currentPreviewTitle: string | null = null;
  let navigationTargetNodeId: string | null = null;
  let activeLocale: GlobalClipToastLocale = 'en';
  let isLoaded = false;
  let closeScheduled = false;
  toastWindow.hookWindowMessage?.(WM_LBUTTONUP, () => {
    openToastTarget(toastWindow, navigationTargetNodeId);
  });
  const scheduleClose = () => {
    if (closeScheduled || currentStatus === 'pending') {
      return;
    }
    closeScheduled = true;
    closeToastAfterDisplay(toastWindow, currentStatus);
  };
  const update = (nextStatus: GlobalClipToastStatus, targetNodeId?: string | null, previewTitle?: string | null) => {
    currentStatus = nextStatus;
    navigationTargetNodeId = nextStatus === 'success' && targetNodeId ? targetNodeId : null;
    currentPreviewTitle = nextStatus === 'success' ? previewTitle ?? currentPreviewTitle : null;
    if (isLoaded && !toastWindow.isDestroyed()) {
      toastWindow.setIgnoreMouseEvents(false);
      if (navigationTargetNodeId) {
        toastWindow.moveTop();
      }
      toastWindow.webContents.send(GLOBAL_CAPTURE_TOAST_TARGET_CHANNEL, { nodeId: navigationTargetNodeId });
      void toastWindow.webContents.executeJavaScript(
        buildToastUpdateScript(nextStatus, navigationTargetNodeId, currentPreviewTitle, activeLocale),
        true
      );
    }
    scheduleClose();
  };
  void resolveToastWindowForDisplay(toastWindow, prepared?.load, currentStatus)
    .then((theme) => {
      if (!toastWindow.isDestroyed()) {
        activeLocale = theme.strings.locale;
        isLoaded = true;
        update(currentStatus, navigationTargetNodeId, currentPreviewTitle);
        positionToastForDisplay(toastWindow);
        toastWindow.showInactive();
        globalThis.setTimeout(() => prepareGlobalClipDesktopToastWindow(), 0);
      }
    });
  return {
    close: () => {
      if (!toastWindow.isDestroyed()) {
        toastWindow.close();
      }
    },
    update
  };
}

installGlobalClipDesktopToastTestHook(showGlobalClipDesktopToast);
