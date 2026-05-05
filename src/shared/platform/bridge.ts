import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import type { RuntimeAppPaths, RuntimeSystemFontCatalog } from './bridgePayloads';
import { toRuntimeAppPaths, toRuntimeSystemFontCatalog } from './bridgePayloads';
import { getElectronAPI } from './electronApi';
import { isDesktopRuntime } from './runtime';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

const EXTERNAL_URL_WINDOW_FEATURES = 'noopener,noreferrer';

export type NativeMenuUnlisten = (() => void) | null;
export type ManagedInboxUpdateUnlisten = (() => void) | null;
export type WindowResizeUnlisten = (() => void) | null;

export type { RuntimeAppPaths, RuntimeSystemFontCatalog } from './bridgePayloads';
export { getRuntimeInvoke } from './runtimeInvoke';
export type { RuntimeInvoke } from './runtimeInvoke';

interface BootPayload {
  [key: string]: unknown;
}

declare global {
  interface Window {
    __FOLIOLE_APP_READY_REPORTED__?: boolean;
    __FOLIOLE_BRIDGE_READY_REPORTED__?: boolean;
  }
}

function getElectronBridge() {
  if (!isDesktopRuntime()) {
    return null;
  }
  return getElectronAPI();
}

function resolveExternalUrl(target: string) {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return new URL(target, window.location.href).toString();
  } catch {
    return null;
  }
}

export async function openExternalUrl(target: string) {
  const trimmedTarget = target.trim();
  if (!trimmedTarget) {
    return;
  }

  const resolvedUrl = resolveExternalUrl(trimmedTarget);
  if (!resolvedUrl) {
    return;
  }

  const runtimeInvoke = getRuntimeInvoke();
  if (runtimeInvoke) {
    try {
      await runtimeInvoke(NATIVE_COMMANDS.openExternalUrl, { url: resolvedUrl });
      return;
    } catch (error) {
      logRuntimeWarning('native external URL open failed', {
        area: 'bridge',
        action: 'open_external_url',
        command: NATIVE_COMMANDS.openExternalUrl,
        fallback: 'window.open',
        target: resolvedUrl,
        error
      });
    }
  }

  window.open(resolvedUrl, '_blank', EXTERNAL_URL_WINDOW_FEATURES);
}

export async function resolveRuntimeAppPaths(): Promise<RuntimeAppPaths | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    const result = toRuntimeAppPaths(await runtimeInvoke(NATIVE_COMMANDS.resolveAppPaths));
    if (!result) {
      logRuntimeWarning('native app path payload invalid', {
        area: 'bridge',
        action: 'resolve_runtime_app_paths',
        command: NATIVE_COMMANDS.resolveAppPaths,
        fallback: 'return_null'
      });
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native app path resolve failed', {
      area: 'bridge',
      action: 'resolve_runtime_app_paths',
      command: NATIVE_COMMANDS.resolveAppPaths,
      fallback: 'return_null',
      error
    });
    return null;
  }
}

export async function listRuntimeSystemFonts(): Promise<RuntimeSystemFontCatalog | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  try {
    const result = toRuntimeSystemFontCatalog(await runtimeInvoke(NATIVE_COMMANDS.listSystemFonts));
    if (!result) {
      logRuntimeWarning('native system font payload invalid', {
        area: 'bridge',
        action: 'list_runtime_system_fonts',
        command: NATIVE_COMMANDS.listSystemFonts,
        fallback: 'return_null'
      });
    }
    return result;
  } catch (error) {
    logRuntimeWarning('native system font listing failed', {
      area: 'bridge',
      action: 'list_runtime_system_fonts',
      command: NATIVE_COMMANDS.listSystemFonts,
      fallback: 'return_null',
      error
    });
    return null;
  }
}

export function reportRuntimeBootStage(stage: string, payload?: BootPayload) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  void runtimeInvoke(NATIVE_COMMANDS.bootReport, { stage, payload }).catch((error) => {
    console.error('[startup] boot_report failed', { stage, error });
  });
}

export function reportRuntimeAppReady(payload?: BootPayload) {
  if (typeof window === 'undefined' || window.__FOLIOLE_APP_READY_REPORTED__) {
    return;
  }
  window.__FOLIOLE_APP_READY_REPORTED__ = true;
  reportRuntimeBootStage('app_ready', payload);
}

export function reportRuntimeBridgeReady(payload?: BootPayload) {
  if (typeof window === 'undefined' || window.__FOLIOLE_BRIDGE_READY_REPORTED__) {
    return;
  }
  if (!getRuntimeInvoke()) {
    return;
  }
  window.__FOLIOLE_BRIDGE_READY_REPORTED__ = true;
  reportRuntimeBootStage('bridge_ready', payload);
}

export async function onNativeMenuCommand(handler: (commandId: string) => void): Promise<NativeMenuUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge) {
    return null;
  }
  return bridge.onNativeMenuCommand((commandId) => {
    if (!commandId.trim() || commandId === '__menu_focus_sync__') {
      return;
    }
    handler(commandId);
  });
}

export async function onManagedInboxUpdated(
  handler: (importId: string) => void
): Promise<ManagedInboxUpdateUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge) {
    return null;
  }
  return bridge.onManagedInboxUpdated((importId) => {
    if (!importId.trim()) {
      return;
    }
    handler(importId);
  });
}

export async function syncNativeMenuState(enabledCommandIds: string[]) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  const uniqueEnabledCommandIds = [...new Set(enabledCommandIds)];
  try {
    await runtimeInvoke(NATIVE_COMMANDS.syncAppMenuState, { enabledCommandIds: uniqueEnabledCommandIds });
  } catch (error) {
    logRuntimeWarning('native menu sync failed', {
      area: 'bridge',
      action: 'sync_native_menu_state',
      command: NATIVE_COMMANDS.syncAppMenuState,
      fallback: 'skip_menu_sync',
      enabledCommandCount: uniqueEnabledCommandIds.length,
      error
    });
  }
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

export async function onMainWindowResized(handler: () => void): Promise<WindowResizeUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge) {
    return null;
  }
  return bridge.onWindowResized(handler);
}

type WindowCommand =
  | typeof NATIVE_COMMANDS.windowMinimize
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

export function closeMainWindow() {
  return invokeWindowCommand(NATIVE_COMMANDS.windowClose);
}
