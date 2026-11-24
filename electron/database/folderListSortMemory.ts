import { z } from 'zod';

import {
  FOLDER_LIST_SORT_MEMORY_KEYS,
  FOLDER_LIST_SORT_MEMORY_SETTING_KEY,
  parseFolderListSortMemoryPayload,
  withFolderListSortChoice,
  type FolderListSortMemoryEdit,
  type FolderListSortMemoryPayload
} from '../../lib/platform/folderListSortMemoryContract.js';

import { currentLibraryScope } from './attachmentResourceDescription.js';
import { openDatabaseConnection } from './connection.js';
import { loadJsonSetting, writeJsonSetting } from './settingsStore.js';

const sortEntry = z.object({ direction: z.enum(['asc', 'desc']), key: z.enum(FOLDER_LIST_SORT_MEMORY_KEYS) });
const sortEdit = z.object({
  choice: sortEntry, fallback: sortEntry, libraryScope: z.string().min(1), listId: z.string().min(1)
}).strict();

function assertLibraryScope(libraryScope: string) {
  if (libraryScope !== currentLibraryScope()) throw new Error('folder_list_sort_library_changed');
}

export function loadFolderListSortMemory(libraryScope: string): FolderListSortMemoryPayload {
  assertLibraryScope(libraryScope);
  return parseFolderListSortMemoryPayload(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY));
}

export function saveFolderListSortMemory(value: unknown): FolderListSortMemoryPayload {
  const { choice, fallback, libraryScope, listId }: FolderListSortMemoryEdit = sortEdit.parse(value);
  assertLibraryScope(libraryScope);
  return openDatabaseConnection().driver.transaction((driver) => {
    const current = loadFolderListSortMemory(libraryScope);
    const next = withFolderListSortChoice(current, listId, choice, fallback);
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      writeJsonSetting(driver, FOLDER_LIST_SORT_MEMORY_SETTING_KEY, next);
    }
    return next;
  });
}
