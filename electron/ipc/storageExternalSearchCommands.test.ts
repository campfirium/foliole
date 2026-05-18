// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { loadReadwiseExternalSearchFolders } = vi.hoisted(() => ({
  loadReadwiseExternalSearchFolders: vi.fn()
}));

const SAVE_EXTERNAL_SEARCH_FOLDERS = 'save_external_search_folders';
let mockedAppDataDir = '/tmp/foliole-storage-external-search-commands';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

vi.mock('../database/readwiseManagedExternalDocuments.js', () => ({
  loadReadwiseExternalSearchFolders
}));

vi.mock('../externalSearchBackgroundRefreshRuntime.js', () => ({
  notifyExternalSearchFoldersChanged: vi.fn()
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { recordOpenedExternalDocument } from '../database/externalOpenedDocuments.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { initializeDatabase } from '../database/migrate.js';

import { handleExternalSearchStorageCommand } from './storageExternalSearchCommands.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-storage-external-search-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  loadReadwiseExternalSearchFolders.mockReturnValue([createReadwiseFolder()]);
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  vi.clearAllMocks();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createSavedFolderInput() {
  return {
    attachment_mode: 'document_relative_first_then_fixed_root' as const,
    attachment_root_path: null,
    excluded_dirs: [],
    folder_path: '/library',
    id: 'saved-folder'
  };
}

function createReadwiseFolder() {
  return {
    attachment_mode: 'document_relative_first_then_fixed_root' as const,
    attachment_root_path: null,
    created_at: '2026-05-18T00:00:00.000Z',
    document_count: 1,
    excluded_dirs: [],
    folder_path: 'Readwise',
    id: 'readwise-folder',
    indexed_at: '2026-05-18T00:00:00.000Z',
    last_error: null,
    status: 'ready' as const,
    updated_at: '2026-05-18T00:00:00.000Z'
  };
}

async function writeTextFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function saveExternalFolders() {
  const result = await Promise.resolve(
    handleExternalSearchStorageCommand(SAVE_EXTERNAL_SEARCH_FOLDERS, {
      folders: [createSavedFolderInput()]
    })
  );
  expect(Array.isArray(result)).toBe(true);
  return result as Array<{ id: string }>;
}

it('keeps the opened external documents folder between saved and Readwise folders after settings save', async () => {
  const openedPath = path.join(tempRoot, 'opened', 'recent.md');
  await writeTextFile(openedPath, '# Recent\nOpened body');
  await recordOpenedExternalDocument(openedPath);

  const result = await saveExternalFolders();

  expect(result.map((folder) => folder.id)).toEqual([
    'saved-folder',
    'opened-external-documents',
    'readwise-folder'
  ]);
});

it('does not add an empty opened external documents folder after settings save', async () => {
  const result = await saveExternalFolders();

  expect(result.map((folder) => folder.id)).toEqual(['saved-folder', 'readwise-folder']);
});
