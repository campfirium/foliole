// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

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
const CONTRACT_FIXTURE_PATH = path.resolve(
  process.cwd(),
  'android/app/src/androidTest/assets/sync-pack-contract.syncpack'
);

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

function insertExternalDocumentSyncState() {
  const folder: NativeExternalSearchFolder = {
    attachment_mode: 'document_relative',
    attachment_root_path: null,
    created_at: '2026-04-27T00:02:00.000Z',
    document_count: 0,
    excluded_dirs: [],
    folder_path: '/library',
    id: 'folder-1',
    indexed_at: null,
    last_error: null,
    status: 'ready',
    updated_at: '2026-04-27T00:02:00.000Z'
  };
  upsertExternalDocuments(folder, [{
    absolutePath: '/library/doc.md',
    content: '# External Doc\n\nExternal body must stay out of pack',
    extension: 'md',
    fileName: 'doc.md',
    modifiedAt: '2026-04-27T00:02:00.000Z',
    modifiedMs: 1777,
    relativePath: 'doc.md',
    sizeBytes: 48
  }], '2026-04-27T00:02:00.000Z');
}

async function buildContractFixturePack(outputPath: string) {
  insertNodeSyncState();
  insertExternalDocumentSyncState();
  return buildDesktopSyncPack({
    createdAt: '2026-04-27T02:00:00.000Z',
    fromDeviceId: 'desktop-fixture',
    fromStateSeq: 0,
    outputPath,
    packId: 'sync-pack-contract-v1',
    toPeerId: 'android-fixture'
  });
}

function readPackRows(packPath: string) {
  const entries = readStoredZipEntries(packPath);
  const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}');
  const incomingBytes = inflateSync(entries.get('incoming.db.deflate') ?? Buffer.alloc(0));
  const incomingPath = path.join(tempRoot, 'read-incoming.db');
  fsSync.writeFileSync(incomingPath, incomingBytes);
  const db = new BetterSqlite3(incomingPath, { readonly: true });
  try {
    return {
      blobDataTable: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_blob_data'").get(),
      blobs: db.prepare('SELECT hash, kind FROM content_blobs').all(),
      externalDocuments: db.prepare('SELECT document_id, content, body_blob_hash, opening_text FROM external_documents').all(),
      manifest,
      nodes: db.prepare('SELECT id, content, body_blob_hash FROM nodes').all(),
      stateRows: db.prepare('SELECT object_type, object_id, state_seq FROM sync_object_state').all()
    };
  } finally {
    db.close();
  }
}

function readStoredZipEntries(filePath: string) {
  const buffer = fsSync.readFileSync(filePath);
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + fileNameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    entries.set(name, buffer.subarray(contentStart, contentStart + compressedSize));
    offset = contentStart + compressedSize;
  }
  return entries;
}

it('builds a sqlite pack with structure and blob manifests but no body bytes', async () => {
  insertNodeSyncState();
  const packPath = path.join(tempRoot, 'incoming.db');

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
    objectCount: 1,
    packId: 'pack-1',
    toStateSeq: 1
  });
  expect(readPackRows(packPath)).toMatchObject({
    blobDataTable: undefined,
    blobs: [expect.objectContaining({ kind: 'text_body' })],
    manifest: expect.objectContaining({
      compression: 'zlib',
      database_file: 'incoming.db.deflate',
      database_compressed_sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      database_uncompressed_sha256: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      format: 'foliole.sync-pack',
      format_version: 1,
      created_at: '2026-04-27T02:00:00.000Z',
      from_device_id: 'desktop-fixture',
      pack_id: 'pack-1',
      schema_version: expect.any(Number),
      to_peer_id: 'android-fixture',
      tables: [
        { name: 'sync_object_state', row_count: 1 },
        { name: 'nodes', row_count: 1 },
        { name: 'external_documents', row_count: 0 },
        { name: 'content_blobs', row_count: 1 }
      ]
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
    manifest: expect.objectContaining({
      compression: 'zlib',
      database_file: 'incoming.db.deflate',
      tables: [
        { name: 'sync_object_state', row_count: 1 },
        { name: 'nodes', row_count: 0 },
        { name: 'external_documents', row_count: 1 },
        { name: 'content_blobs', row_count: 1 }
      ]
    }),
    stateRows: [{ object_id: 'folder-1:doc.md', object_type: 'external_document', state_seq: 1 }]
  });
});

it('keeps the Android sync pack contract fixture deterministic', async () => {
  const generatedPath = path.join(tempRoot, 'sync-pack-contract.syncpack');
  await buildContractFixturePack(generatedPath);
  const generatedBytes = await fs.readFile(generatedPath);

  if (process.env.UPDATE_SYNC_PACK_CONTRACT_FIXTURE === '1') {
    await fs.mkdir(path.dirname(CONTRACT_FIXTURE_PATH), { recursive: true });
    await fs.writeFile(CONTRACT_FIXTURE_PATH, generatedBytes);
  }

  const fixtureBytes = await fs.readFile(CONTRACT_FIXTURE_PATH);
  expect(generatedBytes.equals(fixtureBytes)).toBe(true);
  expect(readPackRows(CONTRACT_FIXTURE_PATH)).toMatchObject({
    externalDocuments: [expect.objectContaining({
      body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      content: '',
      document_id: 'folder-1:doc.md'
    })],
    manifest: expect.objectContaining({
      pack_id: 'sync-pack-contract-v1',
      tables: [
        { name: 'sync_object_state', row_count: 2 },
        { name: 'nodes', row_count: 1 },
        { name: 'external_documents', row_count: 1 },
        { name: 'content_blobs', row_count: 2 }
      ]
    }),
    nodes: [expect.objectContaining({
      body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      content: '',
      id: 'node-1'
    })]
  });
});
