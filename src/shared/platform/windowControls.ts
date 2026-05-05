import { getCurrentWindow } from '@tauri-apps/api/window';

import { isTauriRuntime } from './runtime';

export type WindowResizeUnlisten = (() => void) | null;

function getMainWindow() {
  if (!isTauriRuntime()) {
    return null;
  }
  return getCurrentWindow();
}

export function isWindowControlsAvailable() {
  return isTauriRuntime();
}

export async function queryMainWindowMaximized() {
  const window = getMainWindow();
  if (!window) {
    return false;
  }
  return window.isMaximized();
}

export async function onMainWindowResized(handler: () => void): Promise<WindowResizeUnlisten> {
  const window = getMainWindow();
  if (!window) {
    return null;
  }
  return window.onResized(handler);
}

export async function minimizeMainWindow() {
  const window = getMainWindow();
  if (!window) {
    return;
  }
  await window.minimize();
}

export async function toggleMainWindowMaximize() {
  const window = getMainWindow();
  if (!window) {
    return;
  }
  await window.toggleMaximize();
}

export async function closeMainWindow() {
  const window = getMainWindow();
  if (!window) {
    return;
  }
  await window.close();
}
