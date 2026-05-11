// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-search-cache';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection, resolveDatabasePath } from './connection.js';
import {
  rebuildExternalSearchIndexes,
  refreshExternalSearchIndexes,
  searchExternalDocuments
} from './externalSearchCache.js';
import { loadExternalSearchBrowseEntries } from './externalSearchCacheRead.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-search-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function openCacheDb() {
  return new BetterSqlite3(path.join(path.dirname(resolveDatabasePath()), 'external-search-cache.db'));
}


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

function readDocumentRow(absolutePath: string) {
  const db = openCacheDb();
  try {
    return db
      .prepare(
        `SELECT absolute_path, indexed_at, content
        , is_present
         FROM external_search_documents
         WHERE absolute_path = ?`
      )
      .get(absolutePath) as { absolute_path: string; content: string; indexed_at: string; is_present: number } | undefined;
  } finally {
    db.close();
  }
}

it('refreshes external search indexes incrementally for added, changed, and deleted files', async () => {
  const libraryRoot = path.join(tempRoot, 'library');
  const alphaPath = path.join(libraryRoot, 'alpha.md');
  const betaPath = path.join(libraryRoot, 'beta.md');
  const steadyPath = path.join(libraryRoot, 'steady.md');
  const gammaPath = path.join(libraryRoot, 'gamma.md');

  await writeTextFile(alphaPath, 'alpha original', '2026-04-21T01:00:00.000Z');
  await writeTextFile(betaPath, 'beta original', '2026-04-21T01:01:00.000Z');
  await writeTextFile(steadyPath, 'steady note', '2026-04-21T01:02:00.000Z');

  saveExternalSearchFolders([
    {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: libraryRoot,
      id: 'folder-1'
    }
  ]);

  await refreshExternalSearchIndexes();

  const steadyIndexedBefore = readDocumentRow(steadyPath)?.indexed_at;
  expect(steadyIndexedBefore).toBeTruthy();
  expect(searchExternalDocuments('alpha').map((item) => item.id)).toContain(alphaPath);
  expect(searchExternalDocuments('beta').map((item) => item.id)).toContain(betaPath);
  expect(searchExternalDocuments('steady').map((item) => item.id)).toContain(steadyPath);

  await writeTextFile(alphaPath, 'alpha updated content', '2026-04-21T02:00:00.000Z');
  await fs.unlink(betaPath);
  await writeTextFile(gammaPath, 'gamma new content', '2026-04-21T02:01:00.000Z');

  await refreshExternalSearchIndexes();

  expect(searchExternalDocuments('updated').map((item) => item.id)).toContain(alphaPath);
  expect(searchExternalDocuments('gamma').map((item) => item.id)).toContain(gammaPath);
  expect(searchExternalDocuments('beta')).toHaveLength(0);
  expect(readDocumentRow(betaPath)?.is_present).toBe(0);
  expect(readDocumentRow(steadyPath)?.indexed_at).toBe(steadyIndexedBefore);
});


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

it('keeps manual rebuild as a full rewrite path', async () => {
  const libraryRoot = path.join(tempRoot, 'library');
  const steadyPath = path.join(libraryRoot, 'steady.md');

  await writeTextFile(steadyPath, 'steady note', '2026-04-21T03:00:00.000Z');
  saveExternalSearchFolders([
    {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: libraryRoot,
      id: 'folder-1'
    }
  ]);

  await refreshExternalSearchIndexes();
  const indexedBefore = readDocumentRow(steadyPath)?.indexed_at;

  await new Promise((resolve) => setTimeout(resolve, 20));
  await rebuildExternalSearchIndexes();

  expect(readDocumentRow(steadyPath)?.indexed_at).not.toBe(indexedBefore);
});

it('returns browse entries ordered by relative path for a configured folder', async () => {
  const libraryRoot = path.join(tempRoot, 'library');
  const topLevelPath = path.join(libraryRoot, 'alpha.md');
  const nestedPath = path.join(libraryRoot, 'nested', 'beta.txt');

  await writeTextFile(topLevelPath, '# Alpha', '2026-04-21T04:00:00.000Z');
  await writeTextFile(nestedPath, 'beta body', '2026-04-21T04:01:00.000Z');
  saveExternalSearchFolders([
    {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: libraryRoot,
      id: 'folder-1'
    }
  ]);

  await refreshExternalSearchIndexes();

  expect(loadExternalSearchBrowseEntries('folder-1')).toEqual([
    expect.objectContaining({
      absolute_path: topLevelPath,
      file_name: 'alpha.md',
      folder_id: 'folder-1',
      opening_text: null,
      relative_path: 'alpha.md',
      title: 'Alpha'
    }),
    expect.objectContaining({
      absolute_path: nestedPath,
      file_name: 'beta.txt',
      folder_id: 'folder-1',
      opening_text: 'beta body',
      relative_path: 'nested/beta.txt',
      title: 'nested/beta'
    })
  ]);
});
