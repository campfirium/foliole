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

import { loadOrCreateDesktopInstallationIdentity } from '../desktopInstallationIdentity.js';
import { runImportForMirrorDocument } from '../ipc/importTextFile.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { setExternalFolderEnabled } from './externalFolderDevicePreferences.js';
import { searchExternalDocuments } from './externalSearchDocumentSearch.js';
import { loadExternalSearchFolders, saveExternalSearchFolders } from './externalSearchFolders.js';
import { loadExternalSearchMirrorBrowseEntries, loadExternalSearchMirrorPreview } from './externalSearchMirrorRead.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-remote-mirror-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO external_search_folders (
    id, folder_path, attachment_mode, owner_installation_id, owner_device_name, owner_platform, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ['remote-folder', 'D:\\Docs', 'document_relative', 'other-installation', 'Windows PC', 'win32', 'now', 'now']);
  driver.execute(`INSERT INTO external_documents (
    document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at,
    source_modified_ms, content_hash, title, opening_text, content, indexed_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ['remote-doc', 'remote-folder', 'topic.md', 'topic.md', 'md', 12, 'now', 1, 'hash', 'Topic', 'Opening', '# Topic\nBody', 'now', 'now', 'now']);
});

afterEach(async () => {
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
  expect(searchExternalDocuments('body')).toEqual([
    expect.objectContaining({ externalMatch: expect.objectContaining({ absolutePath: 'mirror-document:remote-doc' }) })
  ]);
  setExternalFolderEnabled(loadOrCreateDesktopInstallationIdentity(), 'remote-folder', false);
  expect(searchExternalDocuments('body')).toEqual([]);
});

it('keeps remote rows when local folder settings are saved and disables only this installation', () => {
  saveExternalSearchFolders([]);
  expect(loadExternalSearchFolders()).toEqual([expect.objectContaining({ access_mode: 'remote_mirror', id: 'remote-folder' })]);
  setExternalFolderEnabled(loadOrCreateDesktopInstallationIdentity(), 'remote-folder', false);
  expect(loadExternalSearchMirrorBrowseEntries('remote-folder')).toBeNull();
  expect(loadExternalSearchFolders()[0]).toMatchObject({ mirror_enabled: false });
});

it('claims a legacy ownerless row only after an exact-path user selection', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO external_search_folders (
    id, folder_path, attachment_mode, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?)`, ['legacy-folder', '/legacy', 'document_relative', 'now', 'now']);
  const input = {
    attachment_mode: 'document_relative_first_then_fixed_root' as const,
    attachment_root_path: null, excluded_dirs: [], folder_path: '/legacy', id: 'legacy-folder'
  };
  saveExternalSearchFolders([input]);
  expect(driver.queryOne<{ owner_installation_id: string | null }>(
    'SELECT owner_installation_id FROM external_search_folders WHERE id = ?', ['legacy-folder']
  )).toEqual({ owner_installation_id: null });
  saveExternalSearchFolders([{ ...input, claim_unowned: true }]);
  expect(driver.queryOne<{ id: string; owner_installation_id: string | null }>(
    'SELECT id, owner_installation_id FROM external_search_folders WHERE id = ?', ['legacy-folder']
  )).toEqual({ id: 'legacy-folder', owner_installation_id: loadOrCreateDesktopInstallationIdentity().installationId });
});
