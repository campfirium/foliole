import type { BrowserWindow } from 'electron';

import type { GlobalClipToastStatus } from './globalClipDesktopToastState.js';
import { waitForRendererAppReady } from './ipc/boot.js';

type CreateToastWindow = () => BrowserWindow;
type LoadToastWindow = (window: BrowserWindow, status: GlobalClipToastStatus) => Promise<void>;

interface PreparedToastWindow {
  load: Promise<void>;
  window: BrowserWindow;
}

let preparedToastWindow: PreparedToastWindow | null = null;
let prepareToastWindowTask: Promise<void> | null = null;

export function takePreparedGlobalClipDesktopToastWindow() {
  const prepared = preparedToastWindow;
  preparedToastWindow = null;
  if (!prepared || prepared.window.isDestroyed()) {
    return null;
  }
  return prepared;
}

export function prepareGlobalClipDesktopToastWindow(createWindow: CreateToastWindow, loadWindow: LoadToastWindow) {
  if (preparedToastWindow && !preparedToastWindow.window.isDestroyed()) {
    return;
  }
  if (prepareToastWindowTask) {
    return;
  }
  prepareToastWindowTask = waitForRendererAppReady().then(() => {
    if (preparedToastWindow && !preparedToastWindow.window.isDestroyed()) {
      return;
    }
    const toastWindow = createWindow();
    const load = loadWindow(toastWindow, 'pending').catch(() => {
      if (!toastWindow.isDestroyed()) {
        toastWindow.close();
      }
    });
    preparedToastWindow = { load, window: toastWindow };
  }).finally(() => {
    prepareToastWindowTask = null;
  });
}

export function resetGlobalClipDesktopToastWindowForTests() {
  if (preparedToastWindow && !preparedToastWindow.window.isDestroyed()) {
    preparedToastWindow.window.close();
  }
  preparedToastWindow = null;
  prepareToastWindowTask = null;
}
