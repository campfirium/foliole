import {
  FOLDER_LIST_SORT_MEMORY_SETTING_KEY,
  parseFolderListSortMemoryPayload,
  type FolderListSortMemoryPayload
} from '../../lib/platform/folderListSortMemoryContract.js';

import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

export function loadFolderListSortMemory(): FolderListSortMemoryPayload {
  return parseFolderListSortMemoryPayload(loadJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY));
}

export function saveFolderListSortMemory(value: unknown): FolderListSortMemoryPayload {
  const payload = parseFolderListSortMemoryPayload(value);
  saveJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY, payload);
  return payload;
}
