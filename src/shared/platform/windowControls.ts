import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getElectronAPI } from './electronApi';
import { isDesktopRuntime } from './runtime';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type WindowResizeUnlisten = (() => void) | null;

function getElectronBridge() {
  if (!isDesktopRuntime()) {
    return null;
  }
  return getElectronAPI();
}

export function isWindowControlsAvailable() {
  return Boolean(getRuntimeInvoke());
}

export async function queryMainWindowMaximized() {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return false;
  }
  try {
    return (await runtimeInvoke(NATIVE_COMMANDS.windowIsMaximized)) === true;
  } catch (error) {
    logRuntimeWarning('window maximized query failed', {
      area: 'bridge',
      action: 'query_main_window_maximized',
      command: NATIVE_COMMANDS.windowIsMaximized,
      fallback: 'assume_not_maximized',
      error
    });
    return false;
  }
}

export async function setMainWindowNativeControlsVisible(visible: boolean) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) return;
  await runtimeInvoke(NATIVE_COMMANDS.windowSetNativeControlsVisible, { visible });
}

export async function onMainWindowResized(handler: () => void): Promise<WindowResizeUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge) {
    return null;
  }
  return bridge.onWindowResized(handler);
}

type WindowCommand =
  | typeof NATIVE_COMMANDS.windowMinimize
  | typeof NATIVE_COMMANDS.windowRestartDevApp
  | typeof NATIVE_COMMANDS.windowRestartApp
  | typeof NATIVE_COMMANDS.windowToggleDevTools
  | typeof NATIVE_COMMANDS.windowToggleMaximize
  | typeof NATIVE_COMMANDS.windowClose;

async function invokeWindowCommand(command: WindowCommand) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  await runtimeInvoke(command);
}

export function minimizeMainWindow() {
  return invokeWindowCommand(NATIVE_COMMANDS.windowMinimize);
}

export function toggleMainWindowMaximize() {
  return invokeWindowCommand(NATIVE_COMMANDS.windowToggleMaximize);
}

export function toggleMainWindowDevTools() {
  return invokeWindowCommand(NATIVE_COMMANDS.windowToggleDevTools);
}

export function restartMainWindowApp() {
  return invokeWindowCommand(NATIVE_COMMANDS.windowRestartApp);
}

export function restartMainWindowDevApp() {
  return invokeWindowCommand(NATIVE_COMMANDS.windowRestartDevApp);
}

export function closeMainWindow() {
  return invokeWindowCommand(NATIVE_COMMANDS.windowClose);
}
