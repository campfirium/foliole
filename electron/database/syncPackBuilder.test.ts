import { createRequire } from 'node:module';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { initializeDatabaseConnection } from '../../lib/core/database/migrations.js';
import type { NativeExternalSearchFolder } from '../../lib/platform/nativeStorageContract.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { openDatabaseConnection } from './connection.js';
import { upsertExternalDocuments } from './externalDocuments.js';
import { buildDesktopSyncPack, buildDesktopSyncPackFromDriver } from './syncPackBuilder.js';
import {
  insertNodeAttachmentRows,
  insertNodeSyncState,
  mockedSyncPackBuilderAppDataDir,
  readPackRows,
  resolveSyncPackPath,
  setupSyncPackBuilderTestLifecycle
} from './syncPackBuilderTestSupport.js';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedSyncPackBuilderAppDataDir,
    app_cache_dir: path.join(mockedSyncPackBuilderAppDataDir, 'cache'),
    app_config_dir: path.join(mockedSyncPackBuilderAppDataDir, 'config'),
    app_log_dir: path.join(mockedSyncPackBuilderAppDataDir, 'logs')
  })
}));

setupSyncPackBuilderTestLifecycle();
const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

const EXTERNAL_DOCUMENT_PACK_TABLES = [
  { name: 'sync_object_state', row_count: 1 },
  { name: 'sync_objects', row_count: 0 },
  { name: 'nodes', row_count: 0 },
  { name: 'node_sync_versions', row_count: 0 },
  { name: 'node_sync_version_parents', row_count: 0 },
  { name: 'node_order', row_count: 0 },
  { name: 'node_attachments', row_count: 0 },
  { name: 'external_documents', row_count: 1 },
  { name: 'content_blobs', row_count: 1 },
  { name: 'review_log', row_count: 0 }
];

it('builds a sqlite pack with structure and blob manifests but no body bytes', async () => {
  insertNodeSyncState();
  insertNodeAttachmentRows();
  const packPath = resolveSyncPackPath('incoming.db');

  const result = await buildDesktopSyncPack({
    createdAt: '2026-04-27T02:00:00.000Z',
    fromDeviceId: 'desktop-fixture',
    outputPath: packPath,
    packId: 'pack-1',
    fromStateSeq: 0,
    toPeerId: 'android-fixture'
  });

  expect(result).toMatchObject({
    bodyBlobCount: 1,
    objectCount: 2,
    packId: 'pack-1',
    toStateSeq: 2
  });
  expectNodePackRows(packPath);
});

it('builds from an explicit isolated driver without reading the desktop connection', async () => {
  const sqlite = new BetterSqlite3(':memory:');
  const driver = createBetterSqlite3Driver(sqlite);
  initializeDatabaseConnection({ driver, sqlite });
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, current_version_id, created_at, updated_at)
     VALUES ('isolated-node', 'topic', 'Isolated', '', 'desktop#isolated-v2',
       '2026-07-21T00:00:00.000Z', '2026-07-21T00:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
     ) VALUES
       ('desktop#isolated-v1', 'isolated-node', NULL, 'desktop',
        '2026-07-20T00:00:00.000Z', 'isolated-v1-hash', '{"id":"isolated-node","title":"First"}'),
       ('desktop#isolated-v2', 'isolated-node', 'desktop#isolated-v1', 'desktop',
        '2026-07-21T00:00:00.000Z', 'isolated-v2-hash', '{"id":"isolated-node","title":"Isolated"}')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'isolated-node', 1, 'isolated-hash', 'acceptance-desktop',
       '2026-07-21T00:00:00.000Z', 1)`
  );
  const packPath = resolveSyncPackPath('isolated.syncpack');
  try {
    await buildDesktopSyncPackFromDriver({
      fromDeviceId: 'acceptance-desktop', fromStateSeq: 0, outputPath: packPath,
      packId: 'isolated-pack', toPeerId: 'ios-runtime-device'
    }, driver);
    expect(readPackRows(packPath)).toMatchObject({
      manifest: expect.objectContaining({ to_peer_id: 'ios-runtime-device' }),
      nodeVersions: [
        expect.objectContaining({ parent_version_id: 'desktop#isolated-v1', version_id: 'desktop#isolated-v2' })
      ],
      nodes: [expect.objectContaining({ id: 'isolated-node' })],
      stateRows: [{ object_id: 'isolated-node', object_type: 'node', state_seq: 1 }]
    });
  } finally {
    sqlite.close();
  }
});

function expectNodePackRows(packPath: string) {
  expect(readPackRows(packPath)).toMatchObject({
    blobDataTable: undefined,
    blobs: [expect.objectContaining({ kind: 'text_body' })],
    manifest: expect.objectContaining({
      compression: 'zlib',
      database_file: 'incoming.db.deflate',
      database_compressed_sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      database_uncompressed_sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      format: 'foliole.sync-pack',
      format_version: 3,
      created_at: '2026-04-27T02:00:00.000Z',
      from_device_id: 'desktop-fixture',
      pack_id: 'pack-1',
      schema_version: expect.any(Number),
      to_peer_id: 'android-fixture',
      tables: [
        { name: 'sync_object_state', row_count: 2 },
        { name: 'sync_objects', row_count: 1 },
        { name: 'nodes', row_count: 1 },
        { name: 'node_sync_versions', row_count: 1 },
        { name: 'node_sync_version_parents', row_count: 0 },
        { name: 'node_order', row_count: 0 },
        { name: 'node_attachments', row_count: 1 },
        { name: 'external_documents', row_count: 0 },
        { name: 'content_blobs', row_count: 1 },
        { name: 'review_log', row_count: 0 }
      ]
    }),
    nodeAttachments: [{ attachment_id: 'att-1', node_id: 'node-1', role: 'image' }],
    nodeVersions: [expect.objectContaining({
      object_id: 'node-1',
      parent_version_id: null,
      version_id: 'desktop#node-1-v1'
    })],
    nodes: [expect.objectContaining({
      body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      content: '',
      current_version_id: 'desktop#node-1-v1',
      id: 'node-1',
      opening_text: 'Node opening preview',
      reveal: 'answer'
    })],
    stateRows: [
      { object_id: 'node-1', object_type: 'node', state_seq: 1 },
      { object_id: 'user_space:windows:desktop:*:app_settings', object_type: 'setting', state_seq: 2 }
    ],
    syncObjects: [expect.objectContaining({
      object_id: 'user_space:windows:desktop:*:app_settings',
      object_type: 'setting',
      payload_json: expect.stringMatching(/theme.*fullTextSearch\.indexStrategy/)
    })]
  });
}

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
  const packPath = resolveSyncPackPath('incoming-external.db');

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
    manifest: expect.objectContaining({
      compression: 'zlib',
      database_file: 'incoming.db.deflate',
      tables: EXTERNAL_DOCUMENT_PACK_TABLES
    }),
    stateRows: [{ object_id: 'folder-1:doc.md', object_type: 'external_document', state_seq: 1 }]
  });
});

it('backfills missing node sync state before building a pack', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at
     ) VALUES ('node-backfill', 'topic', 'Backfilled node', '', 'android#node-v1', 'android', 0,
       '2026-04-27T03:00:00.000Z', '2026-04-27T03:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
     ) VALUES ('android#node-v1', 'node-backfill', NULL, 'android', '2026-04-27T03:00:00.000Z',
       'backfill-node-hash', '{"id":"node-backfill","title":"Backfilled node"}')`
  );
  const packPath = resolveSyncPackPath('incoming-backfill.db');

  const result = await buildDesktopSyncPack({
    createdAt: '2026-04-27T03:01:00.000Z',
    outputPath: packPath,
    packId: 'pack-backfill',
    fromStateSeq: 0
  });

  expect(result).toMatchObject({ objectCount: 1, toStateSeq: 1 });
  expect(readPackRows(packPath)).toMatchObject({
    nodes: [expect.objectContaining({
      current_version_id: 'android#node-v1',
      id: 'node-backfill'
    })],
    stateRows: [{ object_id: 'node-backfill', object_type: 'node', state_seq: 1 }]
  });
});
