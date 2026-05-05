import { loadJsonSetting, saveJsonSetting } from '../database/settingsStore.js';

const WATCH_IMPORT_CURSOR_STATE_KEY = 'watch_import_cursor_state';
const WATCH_IMPORT_CURSOR_STATE_VERSION = 1;

export interface WatchImportCursorEntry {
  mtimeMs: number;
  sizeBytes: number;
}

export interface WatchImportAdapterCursor {
  entries: Record<string, WatchImportCursorEntry>;
  rootPath: string;
  updatedAt: string;
}

interface PersistedWatchImportState {
  adapters: Record<string, WatchImportAdapterCursor>;
  version: number;
}

function isCursorEntry(value: unknown): value is WatchImportCursorEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<WatchImportCursorEntry>;
  return typeof candidate.mtimeMs === 'number' && typeof candidate.sizeBytes === 'number';
}

function normalizeState(value: unknown): PersistedWatchImportState {
  if (!value || typeof value !== 'object') {
    return { adapters: {}, version: WATCH_IMPORT_CURSOR_STATE_VERSION };
  }
  const candidate = value as Partial<PersistedWatchImportState>;
  const adapters = Object.entries(candidate.adapters ?? {}).reduce<Record<string, WatchImportAdapterCursor>>((accumulator, [adapterConfigId, cursor]) => {
    if (!cursor || typeof cursor !== 'object') {
      return accumulator;
    }
    const typedCursor = cursor as Partial<WatchImportAdapterCursor>;
    if (typeof typedCursor.rootPath !== 'string' || typeof typedCursor.updatedAt !== 'string') {
      return accumulator;
    }
    const entries = Object.entries(typedCursor.entries ?? {}).reduce<Record<string, WatchImportCursorEntry>>((entryAccumulator, [sourceName, entry]) => {
      if (isCursorEntry(entry)) {
        entryAccumulator[sourceName] = entry;
      }
      return entryAccumulator;
    }, {});
    accumulator[adapterConfigId] = {
      entries,
      rootPath: typedCursor.rootPath,
      updatedAt: typedCursor.updatedAt
    };
    return accumulator;
  }, {});
  return {
    adapters,
    version: WATCH_IMPORT_CURSOR_STATE_VERSION
  };
}

function loadState() {
  return normalizeState(loadJsonSetting(WATCH_IMPORT_CURSOR_STATE_KEY));
}

export function loadWatchImportAdapterCursor(adapterConfigId: string) {
  return loadState().adapters[adapterConfigId] ?? null;
}

export function saveWatchImportAdapterCursor(adapterConfigId: string, cursor: WatchImportAdapterCursor) {
  const state = loadState();
  saveJsonSetting(
    WATCH_IMPORT_CURSOR_STATE_KEY,
    {
      ...state,
      adapters: {
        ...state.adapters,
        [adapterConfigId]: cursor
      }
    },
    cursor.updatedAt
  );
}
