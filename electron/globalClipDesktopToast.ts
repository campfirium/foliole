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
  resolveToastText,
  resolveToastDisplayMs,
  serializeToastState,
  type GlobalClipDesktopToast,
  type GlobalClipToastStatus
} from './globalClipDesktopToastState.js';
import { installGlobalCaptureToastOpenHandler } from './globalClipToastNavigation.js';

const TOAST_HEIGHT = 64;
const TOAST_MARGIN = 18;
const TOAST_WIDTH = 304;

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
    '.toast{display:grid;grid-template-columns:18px 1fr 36px;align-items:center;gap:14px;width:100%;height:100%;padding:0 22px;font-size:14px;}',
    '.mark{justify-self:center;width:10px;height:10px;border-radius:999px;background:var(--capture-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--capture-accent) 18%,transparent);}',
    '.toast[data-status="copyFailed"] .mark,.toast[data-status="empty"] .mark,.toast[data-status="importFailed"] .mark{background:var(--capture-muted);box-shadow:0 0 0 3px color-mix(in srgb,var(--capture-muted) 16%,transparent);}',
    '.content{display:grid;gap:2px;min-width:0;}',
    '.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;line-height:18px;}',
    '.meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--capture-muted);font-size:12px;line-height:16px;}',
    '.brand{display:flex;width:36px;height:36px;align-items:center;justify-content:center;justify-self:center;opacity:.82;}',
    '.brand img{display:block;width:auto;height:36px;object-fit:contain;}',
    '.brand-fallback{display:block;width:26px;height:31px;border-radius:9px;background:color-mix(in srgb,var(--capture-accent) 34%,transparent);}',
    '.toast[data-clickable="true"]{cursor:pointer;}',
    '</style>',
    `<div class="capture-surface toast" data-clickable="false" data-status="${status}" role="status"><span class="mark"></span><span class="content"><span class="title">${escapeHtml(text.title)}</span><span class="meta">${escapeHtml(text.meta)}</span></span><span class="brand">${buildBrandMarkHtml()}</span></div>`,
    '<script>document.addEventListener("click",()=>{if(document.querySelector(".toast")?.dataset.clickable==="true"){window.globalCaptureToast?.open();}});</script>'
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
    focusable: false,
    frame: false,
    height: TOAST_HEIGHT,
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
    width: TOAST_WIDTH,
    x: x + width - TOAST_WIDTH - TOAST_MARGIN,
    y: y + height - TOAST_HEIGHT - TOAST_MARGIN
  });
  toastWindow.setAlwaysOnTop(true, 'screen-saver');
  toastWindow.setIgnoreMouseEvents(true);
  return toastWindow;
}

export function showGlobalClipDesktopToast(status: GlobalClipToastStatus = 'success'): GlobalClipDesktopToast {
  installGlobalCaptureToastOpenHandler();
  const toastWindow = createToastWindow();
  let currentStatus = status;
  let currentPreviewTitle: string | null = null;
  let navigationTargetNodeId: string | null = null;
  let isLoaded = false;
  let closeScheduled = false;
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
      toastWindow.setIgnoreMouseEvents(!navigationTargetNodeId);
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
