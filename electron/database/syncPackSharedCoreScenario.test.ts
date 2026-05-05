// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-shared-core-scenario-tests';

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
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-shared-core-'));
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('builds a desktop pack and applies it through the shared DbPort pack surface', async () => {
  mockedAppDataDir = path.join(tempRoot, 'source-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  insertSourceNode();
  const syncPackPath = path.join(tempRoot, 'desktop-pack.syncpack');
  await buildDesktopSyncPack({
    createdAt: '2026-05-04T06:00:00.000Z',
    fromDeviceId: 'desktop-source',
    fromStateSeq: 0,
    outputPath: syncPackPath,
    packId: 'desktop-pack-1',
    toPeerId: 'android-target'
  });
  closeDatabaseConnection();

  const incomingPath = extractIncomingPack(syncPackPath, path.join(tempRoot, 'incoming.db'));
  mockedAppDataDir = path.join(tempRoot, 'target-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  installSyncPushAckTable();
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-shared-core-scenario' });

  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      deviceId: 'android-target'
    })).resolves.toMatchObject({
      applied: true,
      appliedBlobCount: 1,
      appliedObjectCount: 1,
      fromStateSeq: 0,
      toStateSeq: 1
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare(
    `SELECT title, content, body_blob_hash, current_version_id, sync_dirty
     FROM nodes WHERE id = 'node-1'`
  ).get()).toEqual({
    body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    content: '',
    current_version_id: 'desktop#1',
    sync_dirty: 0,
    title: 'Packed Article'
  });
  expect(connection.sqlite.prepare(
    `SELECT sync_dirty, state_seq, content_hash
     FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-1'`
  ).get()).toEqual({
    content_hash: 'node-hash-1',
    state_seq: 1,
    sync_dirty: 0
  });
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM content_blobs').get()).toEqual({ count: 1 });
});

function insertSourceNode() {
  const driver = openDatabaseConnection().driver;
  const bodyHash = upsertTextBodyBlob(driver, 'Article body stays in body pack metadata.', '2026-05-04T05:00:00.000Z');
  driver.execute(
    `INSERT INTO nodes (
       id, kind, title, is_title_manual, hide_title_heading, body_blob_hash, content,
       current_version_id, created_at, updated_at
     ) VALUES (?, 'topic', ?, 1, 0, ?, ?, ?, ?, ?)`,
    ['node-1', 'Packed Article', bodyHash, 'Article body stays in body pack metadata.', 'desktop#1',
      '2026-05-04T05:00:00.000Z', '2026-05-04T05:00:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'node-1', 1, 'desktop#1', 'node-hash-1',
       'desktop-source', '2026-05-04T05:00:00.000Z', 1)`
  );
}

function installSyncPushAckTable() {
  openDatabaseConnection().sqlite.exec(`
    CREATE TABLE sync_push_ack (
      client_op_id TEXT PRIMARY KEY NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      state_seq INTEGER,
      status TEXT NOT NULL,
      acked_at TEXT NOT NULL
    )
  `);
}

function extractIncomingPack(syncPackPath: string, incomingPath: string) {
  const entries = readStoredZipEntries(syncPackPath);
  fsSync.writeFileSync(incomingPath, inflateSync(entries.get('incoming.db.deflate') ?? Buffer.alloc(0)));
  return incomingPath;
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
