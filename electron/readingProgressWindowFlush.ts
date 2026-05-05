import type { BrowserWindow } from 'electron';

const windowsAllowedToClose = new WeakSet<BrowserWindow>();

type FlushableWindow = Pick<BrowserWindow, 'close' | 'isDestroyed' | 'webContents'>;

function canFlushWindow(window: FlushableWindow) {
  return !window.isDestroyed() && !window.webContents.isDestroyed();
}

export function allowWindowCloseWithoutReadingProgressFlush(window: BrowserWindow) {
  windowsAllowedToClose.add(window);
}

export async function flushWindowReadingProgress(window: FlushableWindow | null | undefined) {
  if (!window || !canFlushWindow(window)) {
    return false;
  }
  try {
    return (await window.webContents.executeJavaScript(
      'globalThis.__folioleFlushReadingProgressBeforeClose?.() ?? false',
      true
    )) === true;
  } catch (error) {
    console.warn('[reading-progress] flush before window close failed', error);
    return false;
  }
}

export async function flushReadingProgressForWindows(windows: FlushableWindow[]) {
  for (const window of windows) {
    await flushWindowReadingProgress(window);
  }
}

export function bindWindowReadingProgressFlush(window: BrowserWindow) {
  window.on('close', (event) => {
    if (windowsAllowedToClose.has(window)) {
      windowsAllowedToClose.delete(window);
      return;
    }
    event.preventDefault();
    void flushWindowReadingProgress(window).finally(() => {
      if (!canFlushWindow(window)) {
        return;
      }
      allowWindowCloseWithoutReadingProgressFlush(window);
      window.close();
    });
  });
}
