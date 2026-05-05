// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-builder-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { upsertExternalDocuments } from './externalDocuments.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-builder-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNodeSyncState() {
  const driver = openDatabaseConnection().driver;
  const bodyHash = upsertTextBodyBlob(driver, 'node body must stay out of pack', '2026-04-27T00:00:00.000Z');
  driver.execute(
    `INSERT INTO nodes (
       id, kind, title, is_title_manual, hide_title_heading, content, body_blob_hash, created_at, updated_at
     ) VALUES (?, 'topic', ?, 1, 0, ?, ?, ?, ?)`,
    ['node-1', 'Node 1', 'node body must stay out of pack', bodyHash,
      '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'node-1', 1, 'node-hash', 'desktop', '2026-04-27T00:00:00.000Z', 1)`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('setting', 'setting-1', 2, 'setting-hash', 'desktop', '2026-04-27T00:01:00.000Z', 1)`
  );
}

function readPackRows(packPath: string) {
  const db = new BetterSqlite3(packPath, { readonly: true });
  try {
    const manifestRow = db.prepare("SELECT value FROM pack_manifest WHERE key = 'manifest_json'").get() as { value: string };
    return {
      blobDataTable: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_blob_data'").get(),
      blobs: db.prepare('SELECT hash, kind FROM content_blobs').all(),
      externalDocuments: db.prepare('SELECT document_id, content, body_blob_hash, opening_text FROM external_documents').all(),
      manifest: JSON.parse(manifestRow.value),
      nodes: db.prepare('SELECT id, content, body_blob_hash FROM nodes').all(),
      stateRows: db.prepare('SELECT object_type, object_id, state_seq FROM sync_object_state').all()
    };
  } finally {
    db.close();
  }
}

it('builds a sqlite pack with structure and blob manifests but no body bytes', async () => {
  insertNodeSyncState();
  const packPath = path.join(tempRoot, 'incoming.db');

  const result = await buildDesktopSyncPack({
    outputPath: packPath,
    packId: 'pack-1',
    fromStateSeq: 0
  });

  expect(result).toMatchObject({
    bodyBlobCount: 1,
    objectCount: 1,
    packId: 'pack-1',
    toStateSeq: 1
  });
  expect(readPackRows(packPath)).toMatchObject({
    blobDataTable: undefined,
    blobs: [expect.objectContaining({ kind: 'text_body' })],
    manifest: expect.objectContaining({
      pack_id: 'pack-1',
      table_names: ['sync_object_state', 'nodes', 'external_documents', 'content_blobs']
    }),
    nodes: [expect.objectContaining({
      body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      content: '',
      id: 'node-1'
    })],
    stateRows: [{ object_id: 'node-1', object_type: 'node', state_seq: 1 }]
  });
});

it('packs external document structure with body blob manifests but no body bytes', async () => {
  const folder: NativeExternalSearchFolder = {
    attachment_mode: 'document_relative',
    attachment_root_path: null,
    created_at: '2026-04-27T00:00:00.000Z',
    document_count: 0,
    excluded_dirs: [],
    folder_path: '/library',
    id: 'folder-1',
    indexed_at: null,
    last_error: null,
    status: 'ready',
    updated_at: '2026-04-27T00:00:00.000Z'
  };
  upsertExternalDocuments(folder, [{
    absolutePath: '/library/doc.md',
    content: '# External Doc\n\nExternal body must stay out of pack',
    extension: 'md',
    fileName: 'doc.md',
    modifiedAt: '2026-04-27T00:00:00.000Z',
    modifiedMs: 1777,
    relativePath: 'doc.md',
    sizeBytes: 48
  }], '2026-04-27T00:00:00.000Z');
  const packPath = path.join(tempRoot, 'incoming-external.db');

  const result = await buildDesktopSyncPack({
    outputPath: packPath,
    packId: 'pack-external-1',
    fromStateSeq: 0
  });

  expect(result).toMatchObject({
    bodyBlobCount: 1,
    objectCount: 1,
    packId: 'pack-external-1'
  });
  expect(readPackRows(packPath)).toMatchObject({
    blobDataTable: undefined,
    blobs: [expect.objectContaining({ kind: 'text_body' })],
    externalDocuments: [expect.objectContaining({
      body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      content: '',
      document_id: 'folder-1:doc.md',
      opening_text: expect.stringContaining('External body')
    })],
    stateRows: [{ object_id: 'folder-1:doc.md', object_type: 'external_document', state_seq: 1 }]
  });
});
