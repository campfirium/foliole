import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getElectronAPI } from './electronApi';
import { isDesktopRuntime } from './runtime';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type NativeMenuUnlisten = (() => void) | null;

export interface NativeMenuStateSyncPayload {
  enabledCommandIds: string[];
  shortcutAccelerators?: { accelerator: string; commandId: string }[];
}

function getElectronBridge() {
  if (!isDesktopRuntime()) {
    return null;
  }
  return getElectronAPI();
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

export async function syncNativeMenuState(payload: NativeMenuStateSyncPayload) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  const uniqueEnabledCommandIds = [...new Set(payload.enabledCommandIds)];
  try {
    await runtimeInvoke(NATIVE_COMMANDS.syncAppMenuState, {
      enabledCommandIds: uniqueEnabledCommandIds,
      shortcutAccelerators: payload.shortcutAccelerators ?? []
    });
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
