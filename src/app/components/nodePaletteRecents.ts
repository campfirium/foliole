import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { getWhitelistedLocalStorageItem, setWhitelistedLocalStorageItem } from '../../shared/platform/storage';

const RECENT_NODE_LIMIT = 24;

function sanitizeRecentNodeIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value.filter((item): item is string => typeof item === 'string').slice(0, RECENT_NODE_LIMIT);
}

export function getRecentNodeIds() {
  const raw = getWhitelistedLocalStorageItem(APP_SETTINGS_STORAGE_KEYS.nodePaletteRecents);
  if (!raw) {
    return [] as string[];
  }
  try {
    return sanitizeRecentNodeIds(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function setRecentNodeIds(nodeIds: string[]) {
  setWhitelistedLocalStorageItem(
    APP_SETTINGS_STORAGE_KEYS.nodePaletteRecents,
    JSON.stringify(sanitizeRecentNodeIds(nodeIds))
  );
}

export function pushRecentNodeId(nodeIds: string[], nodeId: string) {
  return [nodeId, ...nodeIds.filter((existingId) => existingId !== nodeId)].slice(0, RECENT_NODE_LIMIT);
}
