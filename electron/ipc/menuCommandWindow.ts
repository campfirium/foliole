import { type BaseWindow, BrowserWindow, type BrowserWindow as ElectronBrowserWindow } from 'electron';

function isBrowserWindow(window: BaseWindow | undefined): window is ElectronBrowserWindow {
  return Boolean(window && 'webContents' in window && !window.isDestroyed());
}

export function resolveMenuCommandWindow(candidate: BaseWindow | undefined) {
  if (isBrowserWindow(candidate)) return candidate;
  return BrowserWindow.getFocusedWindow();
}
