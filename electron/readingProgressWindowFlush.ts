import type { BrowserWindow } from 'electron';

const windowsAllowedToClose = new WeakSet<BrowserWindow>();
const WINDOW_CLOSE_FLUSH_TIMEOUT_MS = 800;

type FlushableWindow = Pick<BrowserWindow, 'close' | 'isDestroyed' | 'webContents'>;

function canFlushWindow(window: FlushableWindow) {
  return !window.isDestroyed() && !window.webContents.isDestroyed();
}

async function withCloseFlushTimeout<T>(promise: Promise<T>) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<false>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn('[reading-progress] flush before window close timed out');
      resolve(false);
    }, WINDOW_CLOSE_FLUSH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function allowWindowCloseWithoutReadingProgressFlush(window: BrowserWindow) {
  windowsAllowedToClose.add(window);
}

export async function flushWindowReadingProgress(window: FlushableWindow | null | undefined) {
  if (!window || !canFlushWindow(window)) {
    return false;
  }
  try {
    const result = await withCloseFlushTimeout(window.webContents.executeJavaScript(
      'Promise.all([globalThis.__folioleFlushReadingProgressBeforeClose?.() ?? true, globalThis.__folioleFlushPendingEditorDraftBeforeClose?.() ?? true, globalThis.__folioleFlushLocalFileBeforeClose?.() ?? true]).then((results) => results.every(Boolean))',
      true
    ));
    return result === true;
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
