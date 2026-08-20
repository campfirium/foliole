// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-folder-removal-sync-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { upsertDesktopSource } from './desktopSources.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-folder-removal-sync-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('desktop-test');
  seedExternalFolderMirror();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('deletes a folder mirror when its source tombstone is applied', async () => {
  await applySyncObjectsAsync([{
    content_hash: 'folder-delete-hash',
    deleted_at: '2026-08-18T03:00:00.000Z',
    object_id: 'folder-1',
    object_type: 'external_folder',
    payload_json: null,
    updated_at: '2026-08-18T03:00:00.000Z'
  }]);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne('SELECT id FROM external_search_folders WHERE id = ?', ['folder-1'])).toBeUndefined();
  expect(driver.queryOne('SELECT document_id FROM external_documents WHERE folder_id = ?', ['folder-1'])).toBeUndefined();
});

function seedExternalFolderMirror() {
  const driver = openDatabaseConnection().driver;
  const source = upsertDesktopSource({
    configRef: 'folder-1', rootPath: '/remote', sourceType: 'external', updatedAt: 'now'
  });
  driver.execute(
    `INSERT INTO external_search_folders (
       id, folder_path, attachment_mode, excluded_dirs_json, status, document_count, created_at, updated_at, source_ref
     ) VALUES ('folder-1', '/remote', 'document_relative', '[]', 'ready', 1, 'now', 'now', ?)`,
    [source.source_ref]
  );
  driver.execute(
    `INSERT INTO external_documents (
       document_id, folder_id, relative_path, file_name, extension, source_size_bytes,
       source_modified_at, source_modified_ms, content_hash, title, opening_text, body_blob_hash,
       content, indexed_at, is_present, created_at, updated_at
     ) VALUES (
       'folder-1:note.md', 'folder-1', 'note.md', 'note.md', 'md', 12,
       'now', 1, 'hash', 'Note', NULL, NULL, '# Note', 'now', 1, 'now', 'now'
     )`
  );
}
