import { getRuntimeInvoke } from './bridge';
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
  return Boolean(getWindowControls() || getRuntimeInvoke());
}

export async function queryMainWindowMaximized() {
  const controls = getWindowControls();
  if (controls) {
    return controls.isMaximized();
  }
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return false;
  }
  try {
    return (await runtimeInvoke('window_is_maximized')) === true;
  } catch {
    return false;
  }
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
  if (controls) {
    await controls.minimize();
    return;
  }
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  await runtimeInvoke('window_minimize');
}

export async function toggleMainWindowMaximize() {
  const controls = getWindowControls();
  if (controls) {
    await controls.toggleMaximize();
    return;
  }
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  await runtimeInvoke('window_toggle_maximize');
}

export async function closeMainWindow() {
  const controls = getWindowControls();
  if (controls) {
    await controls.close();
    return;
  }
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  await runtimeInvoke('window_close');
}
