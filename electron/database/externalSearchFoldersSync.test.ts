// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-folder-sync-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { saveImportManagerSettings } from '../import/importManagerSettings.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import {
  disconnectExternalSearchFolder,
  previewExternalSearchFolderReconnect,
  reconnectExternalSearchFolder
} from './externalSearchFolderConnection.js';
import { removeExternalSearchFolder } from './externalSearchFolderRemoval.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-folder-sync-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function readSyncState() {
  return openDatabaseConnection().driver.queryAll<{
    deleted_at: string | null;
    object_id: string;
    object_type: string;
    sync_dirty: number;
  }>(
    `SELECT object_type, object_id, deleted_at, sync_dirty
     FROM sync_object_state
     WHERE object_type = 'external_folder'
     ORDER BY object_id ASC`
  );
}

it('records external search folders as sync objects', () => {
  saveExternalSearchFolders([{
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: null,
    excluded_dirs: ['.git'],
    folder_path: '/library',
    id: 'folder-1'
  }]);

  expect(readSyncState()).toEqual([{
    deleted_at: null,
    object_id: 'folder-1',
    object_type: 'external_folder',
    sync_dirty: 1
  }]);
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sync_change_log WHERE object_type = 'external_folder' AND object_id = 'folder-1'`
  )).toEqual({ count: 0 });
});

it('only removes an external folder through the explicit removal action', () => {
  saveExternalSearchFolders([{
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: null,
    excluded_dirs: [],
    folder_path: '/library',
    id: 'folder-1'
  }]);

  saveExternalSearchFolders([]);

  expect(openDatabaseConnection().driver.queryOne(
    "SELECT id FROM external_search_folders WHERE id = 'folder-1'"
  )).toEqual({ id: 'folder-1' });
  expect(readSyncState()[0]?.deleted_at).toBeNull();

  removeExternalSearchFolder('folder-1');

  const [state] = readSyncState();
  expect(state).toMatchObject({
    object_id: 'folder-1',
    object_type: 'external_folder',
    sync_dirty: 1
  });
  expect(state?.deleted_at).toBeTruthy();
});

it('disconnects and reconnects the same external source without removing its saved documents', async () => {
  const firstPath = path.join(tempRoot, 'external-a');
  const nextPath = path.join(tempRoot, 'external-b');
  await fs.mkdir(firstPath, { recursive: true });
  await fs.mkdir(nextPath, { recursive: true });
  await fs.writeFile(path.join(nextPath, 'kept.md'), '# Kept');
  await fs.writeFile(path.join(nextPath, 'new.md'), '# New');
  saveExternalSearchFolders([{
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: null,
    excluded_dirs: [],
    folder_path: firstPath,
    id: 'folder-stable'
  }]);
  openDatabaseConnection().driver.execute(`INSERT INTO external_documents (
    document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at,
    source_modified_ms, content_hash, title, content, indexed_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ['doc-kept', 'folder-stable', 'kept.md', 'kept.md', 'md', 6, 'now', 1, 'hash', 'Kept', '# Kept', 'now', 'now', 'now']);

  expect(disconnectExternalSearchFolder('folder-stable')[0]).toMatchObject({
    access_mode: 'unowned', id: 'folder-stable'
  });
  expect(openDatabaseConnection().driver.queryOne(
    "SELECT document_id FROM external_documents WHERE folder_id = 'folder-stable'"
  )).toEqual({ document_id: 'doc-kept' });

  await expect(previewExternalSearchFolderReconnect('folder-stable', nextPath)).resolves.toMatchObject({
    matched_count: 1, missing_count: 0, new_count: 1
  });
  const reconnected = await reconnectExternalSearchFolder('folder-stable', nextPath);
  expect(reconnected[0]).toMatchObject({ access_mode: 'local', folder_path: nextPath, id: 'folder-stable' });
  expect(openDatabaseConnection().driver.queryOne(
    "SELECT document_id FROM external_documents WHERE folder_id = 'folder-stable'"
  )).toEqual({ document_id: 'doc-kept' });
});

it('rejects external folders that overlap managed or Readwise folders', () => {
  const readwiseRoot = path.join(tempRoot, 'Readwise');
  saveImportManagerSettings({ readwiseRootPath: readwiseRoot });

  expect(() =>
    saveExternalSearchFolders([{
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: path.join(readwiseRoot, 'Articles'),
      id: 'folder-readwise'
    }])
  ).toThrow('Readwise Reader folder cannot overlap External source 1.');

  expect(() =>
    saveExternalSearchFolders([{
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: path.join(mockedAppDataDir, 'Foliole', 'Mirror'),
      id: 'folder-mirror'
    }])
  ).toThrow('Mirror cannot overlap External source 1.');
});
