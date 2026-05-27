// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-search-mirror-sync';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { refreshExternalSearchIndexes } from './externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-mirror-sync-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function readMainExternalDocuments() {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT document_id, folder_id, relative_path, file_name, is_present, content, body_blob_hash
       FROM external_documents ORDER BY relative_path ASC`
    )
    .all() as Array<Record<string, unknown>>;
}

function readContentBlob(hash: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT hash, kind, availability FROM content_blobs WHERE hash = ?')
    .get(hash) as { availability: string; hash: string; kind: string } | undefined;
}

function readExternalDocumentSyncRows() {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT object_type, object_id, sync_dirty, deleted_at
       FROM sync_object_state WHERE object_type = 'external_document' ORDER BY object_id ASC`
    )
    .all() as Array<Record<string, unknown>>;
}

async function writeTextFile(filePath: string, content: string, modifiedAt: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  const modifiedDate = new Date(modifiedAt);
  await fs.utimes(filePath, modifiedDate, modifiedDate);
}

it('mirrors indexed external documents into the main sync tables', async () => {
  const libraryRoot = path.join(tempRoot, 'library-sync');
  const firstPath = path.join(libraryRoot, 'alpha.md');
  const secondPath = path.join(libraryRoot, 'beta.txt');

  await writeTextFile(firstPath, '# Alpha\nMain cache copy', '2026-04-21T04:00:00.000Z');
  await writeTextFile(secondPath, 'beta body', '2026-04-21T04:01:00.000Z');
  saveExternalSearchFolders([
    {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: libraryRoot,
      id: 'folder-sync'
    }
  ]);

  await refreshExternalSearchIndexes();
  await fs.rm(secondPath);
  await refreshExternalSearchIndexes();

  expect(readMainExternalDocuments()).toEqual([
    expect.objectContaining({
      body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      document_id: 'folder-sync:alpha.md',
      file_name: 'alpha.md',
      folder_id: 'folder-sync',
      is_present: 1,
      relative_path: 'alpha.md'
    }),
    expect.objectContaining({
      body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      document_id: 'folder-sync:beta.txt',
      file_name: 'beta.txt',
      folder_id: 'folder-sync',
      is_present: 0,
      relative_path: 'beta.txt'
    })
  ]);
  expect(readExternalDocumentSyncRows()).toEqual([
    expect.objectContaining({ object_id: 'folder-sync:alpha.md', sync_dirty: 1 }),
    expect.objectContaining({ object_id: 'folder-sync:beta.txt', sync_dirty: 1 })
  ]);
  const alpha = readMainExternalDocuments().find((document) => document.document_id === 'folder-sync:alpha.md');
  expect(readContentBlob(String(alpha?.body_blob_hash))).toEqual({
    availability: 'local',
    hash: alpha?.body_blob_hash,
    kind: 'text_body'
  });
});
