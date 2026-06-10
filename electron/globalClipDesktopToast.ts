import { join } from 'node:path';

import { BrowserWindow, nativeTheme, screen } from 'electron';

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
  resolveToastText,
  resolveToastDisplayMs,
  serializeToastState,
  type GlobalClipDesktopToast,
  type GlobalClipToastStatus
} from './globalClipDesktopToastState.js';
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#2a2d29' : '#ffffff',
    focusable: true,
    frame: false,
    height: TOAST_WINDOW_HEIGHT,
    resizable: false,
    show: false,
    skipTaskbar: true,
    transparent: false,
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

function openToastTarget(toastWindow: BrowserWindow, targetNodeId: string | null) {
  if (!targetNodeId || toastWindow.isDestroyed()) {
    return;
  }
  openGlobalCaptureTarget(targetNodeId, toastWindow.webContents.id);
  toastWindow.close();
}

export function showGlobalClipDesktopToast(status: GlobalClipToastStatus = 'success'): GlobalClipDesktopToast {
  installGlobalCaptureToastOpenHandler();
  const toastWindow = createToastWindow();
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
  void resolveFloatingTheme(toastWindow)
    .then((theme) => toastWindow.loadURL(buildToastHtml(theme, currentStatus)))
    .then(() => {
      if (!toastWindow.isDestroyed()) {
        isLoaded = true;
        update(currentStatus, navigationTargetNodeId, currentPreviewTitle);
        toastWindow.showInactive();
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

type GlobalClipDesktopToastTestHook = (input: {
  previewTitle?: string;
  status?: GlobalClipToastStatus;
  targetNodeId: string;
}) => Promise<{
  bounds: Electron.Rectangle;
  clickPoint: Electron.Point;
  hwndHex: string;
  webContentsId: number;
}>;

declare global {
  var __folioleShowGlobalClipDesktopToastForTests: GlobalClipDesktopToastTestHook | undefined;
}

function isIsolatedDesktopTestRuntime() {
  const workdir = process.env.FOLIOLE_WORKDIR?.trim();
  return process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE === '1' && Boolean(workdir) && workdir !== process.cwd();
}

if (isIsolatedDesktopTestRuntime()) {
  globalThis.__folioleShowGlobalClipDesktopToastForTests = async (input) => {
    const toast = showGlobalClipDesktopToast(input.status ?? 'pending');
    await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    toast.update('success', input.targetNodeId, input.previewTitle ?? null);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    const toastWindow = BrowserWindow.getAllWindows().find((window) =>
      !window.isDestroyed() && window.webContents.getURL().startsWith('data:text/html')
    );
    if (!toastWindow) {
      throw new Error('global capture toast window was not created');
    }
    const bounds = toastWindow.getBounds();
    return {
      bounds,
      clickPoint: screen.dipToScreenPoint({
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
      }),
      hwndHex: toastWindow.getNativeWindowHandle().toString('hex'),
      webContentsId: toastWindow.webContents.id
    };
  };
}
