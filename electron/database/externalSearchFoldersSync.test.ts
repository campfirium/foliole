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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
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

it('writes an external folder tombstone when a folder is removed', () => {
  saveExternalSearchFolders([{
    attachment_mode: 'document_relative_first_then_fixed_root',
    attachment_root_path: null,
    excluded_dirs: [],
    folder_path: '/library',
    id: 'folder-1'
  }]);

  saveExternalSearchFolders([]);

  expect(readSyncState()[0]).toMatchObject({
    object_id: 'folder-1',
    object_type: 'external_folder',
    sync_dirty: 1
  });
  expect(readSyncState()[0].deleted_at).toBeTruthy();
});
