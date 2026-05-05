import { getElectronAPI } from './electronApi';
import { isDesktopRuntime } from './runtime';

export type WindowResizeUnlisten = (() => void) | null;

function getWindowControls() {
  if (!isDesktopRuntime()) {
    return null;
  }
  return getElectronAPI()?.windowControls ?? null;
}

export function isWindowControlsAvailable() {
  return Boolean(getWindowControls());
}

export async function queryMainWindowMaximized() {
  const controls = getWindowControls();
  if (!controls) {
    return false;
  }
  return controls.isMaximized();
}

export async function onMainWindowResized(handler: () => void): Promise<WindowResizeUnlisten> {
  const controls = getWindowControls();
  if (!controls) {
    return null;
  }
  return controls.onResized(handler);
}

export async function minimizeMainWindow() {
  const controls = getWindowControls();
  if (!controls) {
    return;
  }
  await controls.minimize();
}

export async function toggleMainWindowMaximize() {
  const controls = getWindowControls();
  if (!controls) {
    return;
  }
  await controls.toggleMaximize();
}

export async function closeMainWindow() {
  const controls = getWindowControls();
  if (!controls) {
    return;
  }
  await controls.close();
}
