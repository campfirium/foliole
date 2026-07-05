import { applyBootSessionForRelaunch, createRelaunchArgs } from './devRestartSession.js';
import { saveWindowStateNow } from './ipc/windowState.js';
import { allowWindowCloseWithoutReadingProgressFlush, flushReadingProgressForWindows } from './readingProgressWindowFlush.js';

export interface RestartIntentForRelaunch {
  head: string | null;
  nonce: number;
}

export interface RestartIntentApp {
  exit(code?: number): void;
  relaunch(options?: { args?: string[] }): void;
}

export interface RestartIntentWindow {
  isDestroyed?(): boolean;
  webContents?: {
    executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
    getURL(): string;
    isDestroyed(): boolean;
  };
}

function applyRuntimeHeadForRelaunch(intent: RestartIntentForRelaunch) {
  const nextHead = typeof intent.head === 'string' ? intent.head.trim() : '';
  if (nextHead.length === 0) {
    return;
  }
  process.env.FOLIOLE_RUNTIME_HEAD = nextHead;
}

function isMainAppWindow(window: RestartIntentWindow) {
  if (window.isDestroyed?.()) {
    return false;
  }
  if (!window.webContents || window.webContents.isDestroyed()) {
    return false;
  }
  const url = window.webContents.getURL();
  return url.startsWith('file:') || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1');
}

export async function prepareWindowsForDevRestart(windows: RestartIntentWindow[]) {
  await flushReadingProgressForWindows(windows as never[]);
  for (const window of windows) {
    if (!isMainAppWindow(window)) {
      continue;
    }
    allowWindowCloseWithoutReadingProgressFlush(window as never);
    saveWindowStateNow(window as never);
  }
}

export async function relaunchForDevRestartIntent(args: {
  app: RestartIntentApp;
  getWindows: () => RestartIntentWindow[];
  intent: RestartIntentForRelaunch;
}) {
  applyRuntimeHeadForRelaunch(args.intent);
  const nextSession = applyBootSessionForRelaunch(args.intent);
  await prepareWindowsForDevRestart(args.getWindows());
  args.app.relaunch({ args: createRelaunchArgs(nextSession) });
  args.app.exit(0);
}
