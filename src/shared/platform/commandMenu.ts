import { getRuntimeInvoke } from './bridge';
import { getElectronAPI } from './electronApi';
import { isDesktopRuntime } from './runtime';

export type NativeMenuUnlisten = (() => void) | null;

export async function onNativeMenuCommand(handler: (commandId: string) => void): Promise<NativeMenuUnlisten> {
  if (!isDesktopRuntime()) {
    return null;
  }

  const api = getElectronAPI();
  if (!api) {
    return null;
  }

  const unlisten = api.on('foliole:native-menu-command', (commandId) => {
    if (typeof commandId !== 'string' || !commandId.trim() || commandId === '__menu_focus_sync__') {
      return;
    }
    handler(commandId);
  });

  return unlisten;
}

export async function syncNativeMenuState(enabledCommandIds: string[]) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return;
  }
  const uniqueEnabledCommandIds = [...new Set(enabledCommandIds)];
  try {
    await runtimeInvoke('sync_app_menu_state', { enabledCommandIds: uniqueEnabledCommandIds });
  } catch {
    // Ignore sync failures so command execution path is not blocked.
  }
}
