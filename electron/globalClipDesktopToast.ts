import { join } from 'node:path';

import { BrowserWindow, screen } from 'electron';

import { GLOBAL_CAPTURE_TOAST_TARGET_CHANNEL } from './globalCaptureChannels.js';
import {
  buildFloatingThemeStyle,
  escapeHtml,
  type GlobalCaptureFloatingTheme,
  resolveFloatingTheme,
  truncateCapturePreview
} from './globalCaptureFloatingSurface.js';
import { buildBrandMarkHtml } from './globalClipDesktopToastBrand.js';
import {
  prepareGlobalClipDesktopToastWindow as preparePrewarmedToastWindow,
  resetGlobalClipDesktopToastWindowForTests as resetPrewarmedToastWindowForTests,
  takePreparedGlobalClipDesktopToastWindow
} from './globalClipDesktopToastPrewarm.js';
import {
  resolveToastText,
  resolveToastDisplayMs,
  serializeToastState,
  type GlobalClipDesktopToast,
  type GlobalClipToastStatus
} from './globalClipDesktopToastState.js';
import { installGlobalClipDesktopToastTestHook } from './globalClipDesktopToastTestHook.js';
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

function resolveToastView(status: GlobalClipToastStatus, previewTitle?: string | null) {
  const text = resolveToastText(status);
  const preview = previewTitle ? truncateCapturePreview(previewTitle) : '';
  return {
    meta: text.meta,
    title: status === 'success' && preview ? preview : text.title
  };
}

function buildToastHtml(theme: GlobalCaptureFloatingTheme, status: GlobalClipToastStatus) {
  const text = resolveToastView(status);
  const html = [
    '<!doctype html>',
    '<meta charset="utf-8">',
    '<style>',
    buildFloatingThemeStyle(theme),
    'body{padding:22px;}',
    '.toast{display:grid;grid-template-columns:16px 1fr 18px;align-items:center;gap:12px;width:100%;height:100%;padding:0 18px;font-size:14px;}',
    '.mark{justify-self:center;width:8px;height:8px;border-radius:999px;background:var(--capture-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--capture-accent) 16%,transparent);}',
    '.toast[data-status="copyFailed"] .mark,.toast[data-status="empty"] .mark,.toast[data-status="importFailed"] .mark{background:var(--capture-muted);box-shadow:0 0 0 3px color-mix(in srgb,var(--capture-muted) 16%,transparent);}',
    '.content{display:grid;gap:2px;min-width:0;}',
    '.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--capture-title-fg);font-weight:500;line-height:20px;}',
    '.meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--capture-muted);font-size:12px;line-height:16px;}',
    '.brand{display:flex;width:18px;height:18px;align-items:center;justify-content:center;justify-self:center;opacity:.36;}',
    '.brand img{display:block;width:auto;height:18px;object-fit:contain;}',
    '.brand-fallback{display:block;width:14px;height:16px;border-radius:6px;background:color-mix(in srgb,var(--capture-accent) 20%,transparent);}',
    '.toast[data-clickable="true"]{cursor:pointer;}',
    '</style>',
    `<div class="capture-surface toast" data-clickable="false" data-status="${status}" onclick="window.__globalCaptureToastClickCount+=1;if(this.dataset.clickable==='true'){window.globalCaptureToast?.open(this.dataset.targetNodeId);}" role="status"><span class="mark"></span><span class="content"><span class="title">${escapeHtml(text.title)}</span><span class="meta">${escapeHtml(text.meta)}</span></span><span class="brand">${buildBrandMarkHtml()}</span></div>`,
    '<script>window.__globalCaptureToastClickCount=0;</script>'
  ].join('');
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function buildToastUpdateScript(status: GlobalClipToastStatus, targetNodeId: string | null, previewTitle: string | null) {
  const text = resolveToastView(status, previewTitle);
  return `
    (() => {
      const state = ${serializeToastState(status)};
      const titleText = ${JSON.stringify(text.title)};
      const metaText = ${JSON.stringify(text.meta)};
      const targetNodeId = ${JSON.stringify(targetNodeId)};
      const toast = document.querySelector('.toast');
      const title = document.querySelector('.title');
      const meta = document.querySelector('.meta');
      if (!toast || !title || !meta) return;
      toast.dataset.status = state.status;
      toast.dataset.clickable = state.status === 'success' && Boolean(targetNodeId) ? 'true' : 'false';
      toast.dataset.targetNodeId = targetNodeId ?? '';
      title.textContent = titleText;
      meta.textContent = metaText;
    })()
  `;
}

function createToastWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const toastWindow = new BrowserWindow({
    alwaysOnTop: true,
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
      preload: join(process.cwd(), 'electron', 'globalCaptureToastPreload.cjs'),
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

function loadToastWindow(toastWindow: BrowserWindow, status: GlobalClipToastStatus) {
  return resolveFloatingTheme(toastWindow)
    .then((theme) => toastWindow.loadURL(buildToastHtml(theme, status)))
    .then(() => undefined);
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
    openGlobalCaptureTarget(targetNodeId, senderId);
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
      void toastWindow.webContents.executeJavaScript(buildToastUpdateScript(nextStatus, navigationTargetNodeId, currentPreviewTitle), true);
    }
    scheduleClose();
  };
  void (prepared?.load ?? loadToastWindow(toastWindow, currentStatus))
    .then(() => {
      if (!toastWindow.isDestroyed()) {
        isLoaded = true;
        update(currentStatus, navigationTargetNodeId, currentPreviewTitle);
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
