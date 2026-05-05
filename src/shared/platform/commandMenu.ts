import { listen } from '@tauri-apps/api/event';

import { getRuntimeInvoke } from './bridge';
import { isTauriRuntime } from './runtime';

interface NativeMenuCommandPayload {
  commandId?: unknown;
}

export type NativeMenuUnlisten = (() => void) | null;

export async function onNativeMenuCommand(handler: (commandId: string) => void): Promise<NativeMenuUnlisten> {
  if (!isTauriRuntime()) {
    return null;
  }

  const unlisten = await listen<NativeMenuCommandPayload>('app://command-menu', (event) => {
    const commandId = event.payload?.commandId;
    if (typeof commandId !== 'string' || !commandId.trim()) {
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
