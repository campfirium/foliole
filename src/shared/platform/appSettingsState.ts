import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke } from './runtimeInvoke';

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') {
      normalized[key] = item;
    }
  }
  return normalized;
}

export async function loadRuntimeAppSettingsState(): Promise<Record<string, string> | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    return toStringRecord(await runtimeInvoke(NATIVE_COMMANDS.loadAppSettingsState));
  } catch {
    return null;
  }
}

export async function saveRuntimeAppSettingsState(settings: Record<string, string>) {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return false;
  }

  try {
    await runtimeInvoke(NATIVE_COMMANDS.saveAppSettingsState, { settings });
    return true;
  } catch {
    return false;
  }
}
