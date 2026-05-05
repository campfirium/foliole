import { APP_SETTINGS_STORAGE_KEYS } from '../config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../platform/storage';

const RECENT_COMMAND_LIMIT = 1;

function sanitizeRecentCommands(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string').slice(0, RECENT_COMMAND_LIMIT);
}

export function getRecentCommandIds() {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.commandRecents);
  if (!raw) {
    return [] as string[];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeRecentCommands(parsed);
  } catch {
    return [];
  }
}

export function setRecentCommandIds(commandIds: string[]) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.commandRecents,
    JSON.stringify(sanitizeRecentCommands(commandIds))
  );
}

export function pushRecentCommandId(commandIds: string[], commandId: string) {
  return [commandId, ...commandIds.filter((existingId) => existingId !== commandId)].slice(0, RECENT_COMMAND_LIMIT);
}
