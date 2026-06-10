import { BrowserWindow, screen } from 'electron';

import type { GlobalClipDesktopToast } from './globalClipDesktopToastState.js';
import type { GlobalClipToastStatus } from './globalClipDesktopToastState.js';

type ShowToast = (status?: GlobalClipToastStatus) => GlobalClipDesktopToast;

declare global {
  var __folioleShowGlobalClipDesktopToastForTests: ((input: {
    previewTitle?: string;
    status?: GlobalClipToastStatus;
    targetNodeId: string;
  }) => Promise<{
    bounds: Electron.Rectangle;
    clickPoint: Electron.Point;
    hwndHex: string;
    webContentsId: number;
  }>) | undefined;
}

function isIsolatedDesktopTestRuntime() {
  const workdir = process.env.FOLIOLE_WORKDIR?.trim();
  return process.env.FOLIOLE_ALLOW_PARALLEL_INSTANCE === '1' && Boolean(workdir) && workdir !== process.cwd();
}

function isToastWindow(window: BrowserWindow) {
  return !window.isDestroyed() &&
    window.isVisible() &&
    decodeURIComponent(window.webContents.getURL()).includes('class="capture-surface toast"');
}

async function waitForToastWindow() {
  for (let index = 0; index < 30; index += 1) {
    const toastWindow = BrowserWindow.getAllWindows().find(isToastWindow);
    if (toastWindow) return toastWindow;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
  }
  throw new Error('global capture toast window was not created');
}

export function installGlobalClipDesktopToastTestHook(showToast: ShowToast) {
  if (!isIsolatedDesktopTestRuntime()) return;
  globalThis.__folioleShowGlobalClipDesktopToastForTests = async (input) => {
    const toast = showToast(input.status ?? 'pending');
    await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    toast.update('success', input.targetNodeId, input.previewTitle ?? null);
    const toastWindow = await waitForToastWindow();
    const bounds = toastWindow.getBounds();
    return {
      bounds,
      clickPoint: screen.dipToScreenPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }),
      hwndHex: toastWindow.getNativeWindowHandle().toString('hex'),
      webContentsId: toastWindow.webContents.id
    };
  };
}
