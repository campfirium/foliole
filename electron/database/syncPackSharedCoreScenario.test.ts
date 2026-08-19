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
  const packs = await buildSourceSyncPacks();
  const initialIncomingPath = extractIncomingPack(packs.initial, path.join(tempRoot, 'incoming-initial.db'));
  const modifiedIncomingPath = extractIncomingPack(packs.modified, path.join(tempRoot, 'incoming-modified.db'));
  const connection = openTargetDatabase();

  await applyIncomingPackToTarget(connection, initialIncomingPath, 0, {
    appliedObjectCount: 1,
    fromStateSeq: 0,
    toStateSeq: 1
  });
  await applyIncomingPackToTarget(connection, initialIncomingPath, 1, {
    applied: false,
    appliedObjectCount: 0,
    fromStateSeq: 0,
    toStateSeq: 1
  });
  await applyIncomingPackToTarget(connection, modifiedIncomingPath, 1, {
    appliedObjectCount: 1,
    fromStateSeq: 1,
    toStateSeq: 2
  });

  assertTargetRows(connection, {
    contentHash: 'node-hash-2',
    currentVersionId: 'desktop#2',
    stateSeq: 2,
    title: 'Packed Article Updated'
  });
});

async function buildSourceSyncPacks() {
  mockedAppDataDir = path.join(tempRoot, 'source-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  insertSourceNode();
  const initial = path.join(tempRoot, 'desktop-pack-initial.syncpack');
  await buildDesktopSyncPack({
    createdAt: '2026-05-04T06:00:00.000Z',
    fromDeviceId: 'desktop-source',
    fromStateSeq: 0,
    outputPath: initial,
    packId: 'desktop-pack-1',
    toPeerId: 'android-target'
  });
  updateSourceNode();
  const modified = path.join(tempRoot, 'desktop-pack-modified.syncpack');
  await buildDesktopSyncPack({
    createdAt: '2026-05-04T06:05:00.000Z',
    fromDeviceId: 'desktop-source',
    fromStateSeq: 1,
    outputPath: modified,
    packId: 'desktop-pack-2',
    toPeerId: 'android-target'
  });
  closeDatabaseConnection();
  return { initial, modified };
}

function openTargetDatabase() {
  mockedAppDataDir = path.join(tempRoot, 'target-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  installSyncPushAckTable();
  return openDatabaseConnection();
}

async function applyIncomingPackToTarget(
  connection: ReturnType<typeof openDatabaseConnection>,
  incomingPath: string,
  currentCursor: number,
  expected: {
    applied?: boolean;
    appliedObjectCount: number;
    fromStateSeq: number;
    toStateSeq: number;
  }
) {
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-shared-core-scenario' });

  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor,
      hostName: 'android-target'
    })).resolves.toMatchObject({
      applied: expected.applied ?? true,
      appliedObjectCount: expected.appliedObjectCount,
      fromStateSeq: expected.fromStateSeq,
      toStateSeq: expected.toStateSeq
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
}

function assertTargetRows(
  connection: ReturnType<typeof openDatabaseConnection>,
  expected: {
    contentHash: string;
    currentVersionId: string;
    stateSeq: number;
    title: string;
  }
) {
  expect(connection.sqlite.prepare(
    `SELECT title, content, body_blob_hash, current_version_id, sync_dirty
     FROM nodes WHERE id = 'node-1'`
  ).get()).toEqual({
    body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    content: '',
    current_version_id: expected.currentVersionId,
    sync_dirty: 0,
    title: expected.title
  });
  expect(connection.sqlite.prepare(
    `SELECT sync_dirty, state_seq, content_hash
     FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-1'`
  ).get()).toEqual({
    content_hash: expected.contentHash,
    state_seq: expected.stateSeq,
    sync_dirty: 0
  });
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM content_blobs').get()).toEqual({ count: 2 });
}

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
       last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node', 'node-1', 1, 'desktop#1', 'node-hash-1',
       'desktop-source', '2026-05-04T05:00:00.000Z', 1)`
  );
  driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at, content_hash, snapshot_json
     ) VALUES ('desktop#1', 'node-1', NULL, 'desktop-source',
       '2026-05-04T05:00:00.000Z', 'node-hash-1', '{"id":"node-1","title":"Packed Article"}')`
  );
}

function updateSourceNode() {
  const driver = openDatabaseConnection().driver;
  const bodyHash = upsertTextBodyBlob(driver, 'Updated article body stays in body pack metadata.', '2026-05-04T05:05:00.000Z');
  driver.execute(
    `UPDATE nodes
     SET title = ?, content = ?, body_blob_hash = ?, current_version_id = ?, updated_at = ?
     WHERE id = ?`,
    ['Packed Article Updated', 'Updated article body stays in body pack metadata.', bodyHash,
      'desktop#2', '2026-05-04T05:05:00.000Z', 'node-1']
  );
  driver.execute(
    `UPDATE sync_object_state
     SET state_seq = 2, current_version_id = 'desktop#2', content_hash = 'node-hash-2',
       updated_at = '2026-05-04T05:05:00.000Z', sync_dirty = 1
     WHERE object_type = 'node' AND object_id = 'node-1'`
  );
  driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at, content_hash, snapshot_json
     ) VALUES ('desktop#2', 'node-1', 'desktop#1', 'desktop-source',
       '2026-05-04T05:05:00.000Z', 'node-hash-2', '{"id":"node-1","title":"Packed Article Updated"}')`
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
