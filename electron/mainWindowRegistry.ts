import type { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow) {
  mainWindow = window;
  window.once?.('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
}

export function getMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = null;
    return null;
  }
  return mainWindow;
}

export function clearMainWindowForTests() {
  mainWindow = null;
}
