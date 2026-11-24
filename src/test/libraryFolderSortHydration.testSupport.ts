import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

import { closeDatabaseConnection } from '../../electron/database/connection.js';
import { initializeDatabase } from '../../electron/database/migrate.js';
import { saveJsonSetting } from '../../electron/database/settingsStore.js';
import { saveCurrentLibraryHome } from '../../electron/ipc/libraryPathBootstrap.js';
import { updateLibraryPathSetting } from '../../electron/ipc/libraryPaths.js';
import { handleStorageCommand } from '../../electron/ipc/storageCommands.js';
import { INBOX_NODE_ID } from '../../lib/core/database/specialNodeIds';
import { FOLDER_LIST_SORT_MEMORY_SETTING_KEY } from '../../lib/platform/folderListSortMemoryContract';
import { resetFolderListSortMemoryForTests } from '../shared/platform/desktop/folderListSortMemoryStore';
import { createInitialWorkspaceState, useWorkspaceStore } from '../store/workspaceStore';

const host = vi.hoisted(() => ({ root: '', published: vi.fn() }));
vi.mock('../shared/platform/foliolePublishRepository', () => ({
  loadFoliolePublishedTopicsFromRuntime: host.published
}));
vi.mock('electron', () => ({}));
vi.mock('../../electron/nativeAppearance.js', () => ({ applyNativeBaseColorMode: vi.fn() }));
vi.mock('../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_cache_dir: path.join(host.root, 'cache'),
    app_config_dir: path.join(host.root, 'config'), app_data_dir: host.root,
    app_log_dir: path.join(host.root, 'logs') })
}));
vi.mock('../../electron/sync/desktopMemberSyncCadence.js', () => ({ requestDesktopHighValueSync: vi.fn() }));

export const mockPublishedTopics = host.published;

export const FIRST_LIBRARY = { version: 1, sortByListId: { [INBOX_NODE_ID]: { direction: 'asc', key: 'name' } } };
export const SECOND_LIBRARY = { version: 1, sortByListId: {
  [INBOX_NODE_ID]: { direction: 'desc', key: 'dateImported' },
  archive: { direction: 'asc', key: 'dateSaved' }
} };
let root: string;
export const invoke = vi.fn((command: string, args: Record<string, unknown> = {}) =>
  handleStorageCommand(command, args, null));

export function openLibrary(name: string) {
  closeDatabaseConnection();
  saveCurrentLibraryHome(path.join(root, name));
  initializeDatabase();
}

export function selectSecondLibrary() {
  return updateLibraryPathSetting({
    confirm_existing_library_home: true, location: 'library_home', path: path.join(root, 'second')
  });
}

beforeEach(async () => {
  mkdirSync('.tmp/artifacts/T858-4', { recursive: true });
  root = mkdtempSync(path.resolve('.tmp/artifacts/T858-4/desktop-sort-'));
  host.root = path.join(root, 'app');
  invoke.mockClear();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { invoke } });
  useWorkspaceStore.setState(createInitialWorkspaceState(new Date()));
  openLibrary('second');
  saveJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY, SECOND_LIBRARY);
  openLibrary('first');
  saveJsonSetting(FOLDER_LIST_SORT_MEMORY_SETTING_KEY, FIRST_LIBRARY);
  await useWorkspaceStore.persist.rehydrate();
});

afterEach(() => {
  cleanup();
  resetFolderListSortMemoryForTests();
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: undefined });
  closeDatabaseConnection();
  rmSync(root, { recursive: true, force: true });
});
