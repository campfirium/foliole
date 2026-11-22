/**
 * Sort order a person chose for one list (a folder, a system entry, an external folder...). It is a library setting
 * kept once per form factor, so desktops share one set and phones share another, and later writes win whole.
 */
export const FOLDER_LIST_SORT_MEMORY_SETTING_KEY = 'folder_list_sort_memory';
export const FOLDER_LIST_SORT_MEMORY_PAYLOAD_VERSION = 1;
export const FOLDER_LIST_SORT_MEMORY_MAX_ENTRIES = 2000;

export const FOLDER_LIST_SORT_MEMORY_KEYS = [
  'dateDeleted', 'dateImported', 'dateLastOpened', 'dateSaved', 'manual', 'name'
] as const;

export type FolderListSortMemoryKey = (typeof FOLDER_LIST_SORT_MEMORY_KEYS)[number];
export type FolderListSortMemoryDirection = 'asc' | 'desc';
export type FolderListSortMemoryEntry = { direction: FolderListSortMemoryDirection; key: FolderListSortMemoryKey };

export type FolderListSortMemoryPayload = {
  sortByListId: Record<string, FolderListSortMemoryEntry>;
  version: typeof FOLDER_LIST_SORT_MEMORY_PAYLOAD_VERSION;
};

export const EMPTY_FOLDER_LIST_SORT_MEMORY: FolderListSortMemoryPayload = Object.freeze({
  sortByListId: Object.freeze({}) as Record<string, FolderListSortMemoryEntry>,
  version: FOLDER_LIST_SORT_MEMORY_PAYLOAD_VERSION
});

const KEY_SET = new Set<string>(FOLDER_LIST_SORT_MEMORY_KEYS);

function parseEntry(value: unknown): FolderListSortMemoryEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { direction, key } = value as Record<string, unknown>;
  if (typeof key !== 'string' || !KEY_SET.has(key)) return null;
  if (direction !== 'asc' && direction !== 'desc') return null;
  return { direction, key: key as FolderListSortMemoryKey };
}

/**
 * Reads a stored or synced value. Another app version may write keys this one does not know, so unknown entries are
 * dropped instead of failing the whole setting.
 */
export function parseFolderListSortMemoryPayload(value: unknown): FolderListSortMemoryPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_FOLDER_LIST_SORT_MEMORY;
  const source = value as Record<string, unknown>;
  if (source.version !== FOLDER_LIST_SORT_MEMORY_PAYLOAD_VERSION) return EMPTY_FOLDER_LIST_SORT_MEMORY;
  const entries = source.sortByListId;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return EMPTY_FOLDER_LIST_SORT_MEMORY;
  const sortByListId: Record<string, FolderListSortMemoryEntry> = {};
  for (const [listId, raw] of Object.entries(entries as Record<string, unknown>)) {
    const entry = listId ? parseEntry(raw) : null;
    if (entry) sortByListId[listId] = entry;
  }
  return { sortByListId: trimEntries(sortByListId), version: FOLDER_LIST_SORT_MEMORY_PAYLOAD_VERSION };
}

function trimEntries(sortByListId: Record<string, FolderListSortMemoryEntry>) {
  const ids = Object.keys(sortByListId);
  if (ids.length <= FOLDER_LIST_SORT_MEMORY_MAX_ENTRIES) return sortByListId;
  const kept: Record<string, FolderListSortMemoryEntry> = {};
  for (const id of ids.slice(ids.length - FOLDER_LIST_SORT_MEMORY_MAX_ENTRIES)) kept[id] = sortByListId[id]!;
  return kept;
}

/**
 * Records one list's choice. Choosing the list's own default removes the record, so the list follows the default
 * again; the most recent choice moves to the end so trimming drops the oldest first.
 */
export function withFolderListSortChoice(
  payload: FolderListSortMemoryPayload,
  listId: string,
  choice: FolderListSortMemoryEntry,
  fallback: FolderListSortMemoryEntry
): FolderListSortMemoryPayload {
  const sortByListId = { ...payload.sortByListId };
  delete sortByListId[listId];
  if (choice.key !== fallback.key || choice.direction !== fallback.direction) {
    sortByListId[listId] = { direction: choice.direction, key: choice.key };
  }
  return { sortByListId: trimEntries(sortByListId), version: FOLDER_LIST_SORT_MEMORY_PAYLOAD_VERSION };
}

/** Lists that are not library nodes: an external folder, or one directory inside it. Nodes use their own id. */
export function externalFolderListSortId(folderId: string, directoryPath?: string | null) {
  return directoryPath ? `external:${folderId}:${directoryPath}` : `external:${folderId}`;
}

export const NATIVE_FOLDER_LIST_SORT_COMMANDS = {
  loadFolderListSortMemory: 'load_folder_list_sort_memory',
  saveFolderListSortMemory: 'save_folder_list_sort_memory'
} as const;
