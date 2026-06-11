// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { loadReadwiseExternalSearchFolders } = vi.hoisted(() => ({
  loadReadwiseExternalSearchFolders: vi.fn()
}));

const SAVE_EXTERNAL_SEARCH_FOLDERS = 'save_external_search_folders';
const LOAD_EXTERNAL_SEARCH_BROWSE_ENTRIES = 'load_external_search_browse_entries';
const LOAD_EXTERNAL_SEARCH_FOLDERS = 'load_external_search_folders';
const LOAD_EXTERNAL_SEARCH_PREVIEW = 'load_external_search_preview';
const REBUILD_EXTERNAL_SEARCH_INDEX = 'rebuild_external_search_index';
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
  isReadwiseExternalFolderId: () => false,
  loadReadwiseExternalSearchBrowseEntries: () => [],
  loadReadwiseExternalSearchFolders,
  loadReadwiseExternalSearchPreview: () => null
}));

vi.mock('../externalSearchBackgroundRefreshRuntime.js', () => ({
  notifyExternalSearchFoldersChanged: vi.fn()
}));

import { closeDatabaseConnection } from '../database/connection.js';
import { recordOpenedExternalDocument } from '../database/externalOpenedDocuments.js';
import { closeExternalSearchCacheDatabase } from '../database/externalSearchCacheDatabase.js';
import { readLocalFile } from '../database/localFiles.js';
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

async function saveExternalFolder(folderPath: string) {
  const result = await Promise.resolve(
    handleExternalSearchStorageCommand(SAVE_EXTERNAL_SEARCH_FOLDERS, {
      folders: [{ ...createSavedFolderInput(), folder_path: folderPath }]
    })
  );
  expect(Array.isArray(result)).toBe(true);
}

it('clears legacy opened external documents after settings save', async () => {
  const openedPath = path.join(tempRoot, 'opened', 'recent.md');
  await writeTextFile(openedPath, '# Recent\nOpened body');
  await recordOpenedExternalDocument(openedPath);

  const result = await saveExternalFolders();

  expect(result.map((folder) => folder.id)).toEqual(['saved-folder', 'readwise-folder']);
});

it('does not add an empty opened external documents folder after settings save', async () => {
  const result = await saveExternalFolders();

  expect(result.map((folder) => folder.id)).toEqual(['saved-folder', 'readwise-folder']);
});

it('shows local file metadata in the opened files folder without an external content mirror', async () => {
  const localPath = path.join(tempRoot, 'loose', 'local.md');
  await writeTextFile(localPath, '# Local\nEditable body');
  await readLocalFile(localPath);

  const folders = await Promise.resolve(handleExternalSearchStorageCommand(LOAD_EXTERNAL_SEARCH_FOLDERS, {}));
  expect((folders as Array<{ document_count: number; folder_path: string; id: string }>)).toEqual(expect.arrayContaining([
    expect.objectContaining({
      document_count: 1,
      folder_path: 'Local',
      id: 'opened-external-documents'
    })
  ]));

  const entries = handleExternalSearchStorageCommand(LOAD_EXTERNAL_SEARCH_BROWSE_ENTRIES, {
    folder_id: 'opened-external-documents'
  }) as Array<{ absolute_path: string; editable: boolean; source_kind: string }>;
  expect(entries).toEqual([
    expect.objectContaining({
      absolute_path: localPath,
      editable: true,
      source_kind: 'local_file'
    })
  ]);
});

it('prefers editable opened local file entries over read-only external rows for the same path', async () => {
  const libraryPath = path.join(tempRoot, 'library');
  const localPath = path.join(libraryPath, 'topic.md');
  await writeTextFile(localPath, '# Cached\nOld body');
  await saveExternalFolder(libraryPath);
  await Promise.resolve(handleExternalSearchStorageCommand(REBUILD_EXTERNAL_SEARCH_INDEX, {}));
  await readLocalFile(localPath);

  const entries = handleExternalSearchStorageCommand(LOAD_EXTERNAL_SEARCH_BROWSE_ENTRIES, {
    folder_id: 'opened-external-documents'
  }) as Array<{ absolute_path: string; editable: boolean; source_kind: string }>;

  expect(entries).toEqual([
    expect.objectContaining({
      absolute_path: localPath,
      editable: true,
      source_kind: 'local_file'
    })
  ]);
});

it('loads editable disk content for opened local file previews even when external cache has the same path', async () => {
  const libraryPath = path.join(tempRoot, 'library');
  const localPath = path.join(libraryPath, 'topic.md');
  await writeTextFile(localPath, '# Cached\nOld body');
  await saveExternalFolder(libraryPath);
  await Promise.resolve(handleExternalSearchStorageCommand(REBUILD_EXTERNAL_SEARCH_INDEX, {}));
  await writeTextFile(localPath, '# Current\nEditable body');
  await readLocalFile(localPath);

  const preview = await Promise.resolve(handleExternalSearchStorageCommand(LOAD_EXTERNAL_SEARCH_PREVIEW, {
    absolute_path: localPath,
    folder_id: 'opened-external-documents',
    source_kind: 'local_file'
  })) as { content: string; editable: boolean; source_kind: string };

  expect(preview).toEqual(expect.objectContaining({
    content: '# Current\nEditable body',
    editable: true,
    source_kind: 'local_file'
  }));
});

it('uses opened local file metadata when preview source kind is missing', async () => {
  const libraryPath = path.join(tempRoot, 'library');
  const localPath = path.join(libraryPath, 'topic.md');
  await writeTextFile(localPath, '# Cached\nOld body');
  await saveExternalFolder(libraryPath);
  await Promise.resolve(handleExternalSearchStorageCommand(REBUILD_EXTERNAL_SEARCH_INDEX, {}));
  await writeTextFile(localPath, '# Current\nEditable body');
  await readLocalFile(localPath);

  const preview = await Promise.resolve(handleExternalSearchStorageCommand(LOAD_EXTERNAL_SEARCH_PREVIEW, {
    absolute_path: localPath,
    folder_id: 'opened-external-documents'
  })) as { content: string; editable: boolean; source_kind: string };

  expect(preview).toEqual(expect.objectContaining({
    content: '# Current\nEditable body',
    editable: true,
    source_kind: 'local_file'
  }));
});
