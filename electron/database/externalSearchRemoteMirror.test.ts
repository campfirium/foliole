// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-remote-mirror-tests';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../import/managedInboxEvents.js', () => ({ notifyManagedInboxUpdated: vi.fn() }));

import { runImportForMirrorDocument } from '../ipc/importTextFile.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { setExternalFolderEnabled } from './externalFolderHostPreferences.js';
import { openExternalSearchCacheDatabase, closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { searchExternalDocuments } from './externalSearchDocumentSearch.js';
import {
  disconnectExternalSearchFolder,
  previewExternalSearchFolderReconnect,
  reconnectExternalSearchFolder
} from './externalSearchFolderConnection.js';
import { removeExternalSearchFolder } from './externalSearchFolderRemoval.js';
import { loadExternalSearchFolders, saveExternalSearchFolders } from './externalSearchFolders.js';
import { loadExternalSearchMirrorBrowseEntries, loadExternalSearchMirrorPreview } from './externalSearchMirrorRead.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-remote-mirror-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO desktop_sources (source_ref, source_type, config_ref, host_name,
    host_platform, root_path, path_flavor, type_settings_json, created_at, updated_at)
    VALUES ('external:remote-folder', 'external', 'remote-folder', 'Windows PC', 'win32',
      'D:\\Docs', 'windows', '{}', 'now', 'now')`);
  driver.execute(`INSERT INTO external_search_folders (
    id, folder_path, attachment_mode, created_at, updated_at, source_ref
  ) VALUES (?, ?, ?, ?, ?, ?)`,
  ['remote-folder', 'D:\\Docs', 'document_relative', 'now', 'now', 'external:remote-folder']);
  driver.execute(`INSERT INTO external_documents (
    document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at,
    source_modified_ms, content_hash, title, opening_text, content, indexed_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ['remote-doc', 'remote-folder', 'topic.md', 'topic.md', 'md', 12, 'now', 1, 'hash', 'Topic', 'Opening', '# Topic\nBody', 'now', 'now', 'now']);
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('reads a remote document by id without using its source path', () => {
  expect(loadExternalSearchMirrorBrowseEntries('remote-folder')).toEqual([
    expect.objectContaining({ document_id: 'remote-doc', reference: { document_id: 'remote-doc', kind: 'mirror_document' } })
  ]);
  expect(loadExternalSearchMirrorPreview('remote-doc')).toMatchObject({ content: '# Topic\nBody', document_id: 'remote-doc' });
});

it('imports remote mirror content without authorizing or reading the remote path', () => {
  const result = runImportForMirrorDocument('remote-doc');
  expect(result).toMatchObject({ node_id: expect.any(String), source_locator: 'mirror-document:remote-doc' });
  expect(openDatabaseConnection().driver.queryOne<{ content: string }>(
    'SELECT content FROM nodes WHERE id = ?', [result.node_id]
  )).toEqual({ content: '# Topic\nBody' });
});

it('searches enabled mirror content and removes it from results when disabled', () => {
  const cache = openExternalSearchCacheDatabase();
  cache.prepare(`INSERT INTO external_search_documents (
    absolute_path, folder_id, folder_path, relative_path, file_name, extension, size_bytes,
    modified_at, modified_ms, indexed_at, is_present, content
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'D:\\Docs\\topic.md', 'remote-folder', 'D:\\Docs', 'topic.md', 'topic.md', 'md', 12,
    'now', 1, 'now', 1, '# Topic\nBody'
  );
  cache.prepare(`INSERT INTO external_search_fts (
    title, file_name, relative_path, content, absolute_path, folder_id, folder_path, modified_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'Topic', 'topic.md', 'topic.md', '# Topic\nBody', 'D:\\Docs\\topic.md',
    'remote-folder', 'D:\\Docs', 'now'
  );
  expect(searchExternalDocuments('body')).toEqual([
    expect.objectContaining({ externalMatch: expect.objectContaining({ absolutePath: 'mirror-document:remote-doc' }) })
  ]);
  setExternalFolderEnabled('remote-folder', false);
  expect(searchExternalDocuments('body')).toEqual([]);
});

it('keeps remote rows when local folder settings are saved and disables only this Host', () => {
  saveExternalSearchFolders([]);
  expect(loadExternalSearchFolders()).toEqual([expect.objectContaining({ access_mode: 'remote_mirror', id: 'remote-folder' })]);
  setExternalFolderEnabled('remote-folder', false);
  expect(loadExternalSearchMirrorBrowseEntries('remote-folder')).toBeNull();
  expect(loadExternalSearchFolders()[0]).toMatchObject({ mirror_enabled: false });
});

it('does not claim a remote Source when a local folder uses its id and path', () => {
  const driver = openDatabaseConnection().driver;
  const input = {
    attachment_mode: 'document_relative_first_then_fixed_root' as const, attachment_root_path: null,
    excluded_dirs: [], folder_path: 'D:\\Docs', id: 'remote-folder'
  };
  saveExternalSearchFolders([input]);
  expect(driver.queryOne('SELECT host_name, root_path FROM desktop_sources WHERE source_ref = ?',
    ['external:remote-folder'])).toEqual({ host_name: 'Windows PC', root_path: 'D:\\Docs' });
});

it('rejects reconnect, disconnect, and removal for another Host Source', async () => {
  await expect(previewExternalSearchFolderReconnect('remote-folder', tempRoot))
    .rejects.toThrow('external_folder_not_local');
  await expect(reconnectExternalSearchFolder('remote-folder', tempRoot))
    .rejects.toThrow('external_folder_not_local');
  expect(() => disconnectExternalSearchFolder('remote-folder')).toThrow('external_folder_not_local');
  expect(() => removeExternalSearchFolder('remote-folder')).toThrow('external_folder_not_local');
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT host_name FROM desktop_sources WHERE source_ref = ?', ['external:remote-folder']
  )).toEqual({ host_name: 'Windows PC' });
});
