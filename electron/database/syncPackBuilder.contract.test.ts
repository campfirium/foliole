// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-builder-contract-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
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
const CONTRACT_FIXTURE_PATH = path.resolve(process.cwd(), 'android/app/src/androidTest/assets/sync-pack-contract.syncpack');
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-contract-'));
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
       id, kind, title, is_title_manual, hide_title_heading, opening_text, content, body_blob_hash, created_at, updated_at
     ) VALUES (?, 'topic', ?, 1, 0, ?, ?, ?, ?, ?)`,
    ['node-1', 'Node 1', 'Node opening preview', 'node body must stay out of pack', bodyHash,
      '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'node-1', 1, 'node-hash', 'desktop', '2026-04-27T00:00:00.000Z', 1)`
  );
  driver.execute('INSERT INTO node_order (node_id, position) VALUES (?, ?)', ['node-1', 3]);
  driver.execute(
    `INSERT INTO setting_records (
       key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at
     ) VALUES ('app_settings', 'user_space', 'windows', 'desktop', '*', '{"theme":"dark"}',
       'setting-hash', '2026-04-27T00:01:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('setting', 'user_space:windows:desktop:*:app_settings', 2, 'setting-hash',
       'desktop', '2026-04-27T00:01:00.000Z', 1)`
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

function insertNodeAttachmentRows() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['att-1', 'cover.png', 'image/png', 12, '2026-04-27T00:02:30.000Z']
  );
  driver.execute(
    'INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)',
    ['node-1', 'att-1', 'image']
  );
}

async function buildContractFixturePack(outputPath: string) {
  insertNodeSyncState();
  insertNodeAttachmentRows();
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
  const incomingPath = path.join(tempRoot, 'read-incoming.db');
  fsSync.writeFileSync(incomingPath, inflateSync(entries.get('incoming.db.deflate') ?? Buffer.alloc(0)));
  const db = new BetterSqlite3(incomingPath, { readonly: true });
  try {
    return {
      externalDocuments: db.prepare('SELECT document_id, content, body_blob_hash FROM external_documents').all(),
      manifest,
      nodeAttachments: db.prepare('SELECT node_id, attachment_id, role FROM node_attachments').all(),
      nodeOrder: db.prepare('SELECT node_id, position FROM node_order').all(),
      nodes: db.prepare('SELECT id, content, body_blob_hash, opening_text FROM nodes').all()
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
    externalDocuments: [expect.objectContaining({ content: '', document_id: 'folder-1:doc.md' })],
    manifest: expect.objectContaining({
      pack_id: 'sync-pack-contract-v1',
      tables: [
        { name: 'sync_object_state', row_count: 3 },
        { name: 'sync_objects', row_count: 1 },
        { name: 'nodes', row_count: 1 },
        { name: 'node_order', row_count: 1 },
        { name: 'node_attachments', row_count: 1 },
        { name: 'external_documents', row_count: 1 },
        { name: 'content_blobs', row_count: 2 },
        { name: 'review_log', row_count: 0 }
      ]
    }),
    nodeAttachments: [{ attachment_id: 'att-1', node_id: 'node-1', role: 'image' }],
    nodeOrder: [{ node_id: 'node-1', position: 3 }],
    nodes: [expect.objectContaining({ content: '', id: 'node-1', opening_text: 'Node opening preview' })]
  });
});
