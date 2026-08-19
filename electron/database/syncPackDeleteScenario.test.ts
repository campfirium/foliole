// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-delete-scenario-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { buildDesktopSyncPack } from './syncPackBuilder.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-delete-'));
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('applies a create pack followed by a tombstone pack through the shared pack surface', async () => {
  const packs = await buildSourceCreateAndDeletePacks();
  const connection = openTargetDatabase();

  await applyPack(connection, extractIncomingPack(packs.created, path.join(tempRoot, 'incoming-create.db')), 0, 1);
  await applyPack(connection, extractIncomingPack(packs.deleted, path.join(tempRoot, 'incoming-delete.db')), 1, 2);

  expect(connection.sqlite.prepare(
    `SELECT title, current_version_id, deleted_at, sync_dirty
     FROM nodes WHERE id = 'node-delete'`
  ).get()).toEqual({
    current_version_id: 'desktop#delete',
    deleted_at: '2026-05-04T08:05:00.000Z',
    sync_dirty: 0,
    title: 'Deleted Article'
  });
  expect(connection.sqlite.prepare(
    `SELECT state_seq, deleted_at, sync_dirty
     FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-delete'`
  ).get()).toEqual({
    deleted_at: '2026-05-04T08:05:00.000Z',
    state_seq: 2,
    sync_dirty: 0
  });
});

async function buildSourceCreateAndDeletePacks() {
  mockedAppDataDir = path.join(tempRoot, 'source-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  insertSourceNode();
  const created = path.join(tempRoot, 'create.syncpack');
  await buildDesktopSyncPack({
    createdAt: '2026-05-04T08:00:30.000Z',
    fromDeviceId: 'desktop-source',
    fromStateSeq: 0,
    outputPath: created,
    packId: 'delete-scenario-create',
    toPeerId: 'android-target'
  });
  markSourceNodeDeleted();
  const deleted = path.join(tempRoot, 'delete.syncpack');
  await buildDesktopSyncPack({
    createdAt: '2026-05-04T08:05:30.000Z',
    fromDeviceId: 'desktop-source',
    fromStateSeq: 1,
    outputPath: deleted,
    packId: 'delete-scenario-delete',
    toPeerId: 'android-target'
  });
  closeDatabaseConnection();
  return { created, deleted };
}

function openTargetDatabase() {
  mockedAppDataDir = path.join(tempRoot, 'target-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
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
  return openDatabaseConnection();
}

async function applyPack(
  connection: ReturnType<typeof openDatabaseConnection>,
  incomingPath: string,
  currentCursor: number,
  toStateSeq: number
) {
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-delete-scenario' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor,
      hostName: 'android-target'
    })).resolves.toMatchObject({
      applied: true,
      appliedObjectCount: 1,
      toStateSeq
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
}

function insertSourceNode() {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, created_at, updated_at
     ) VALUES ('node-delete', 'topic', 'Article To Delete', '', 'desktop#1',
       '2026-05-04T08:00:00.000Z', '2026-05-04T08:00:00.000Z')`
  );
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node', 'node-delete', 1, 'desktop#1', 'node-delete-hash-1',
       'desktop-source', '2026-05-04T08:00:00.000Z', 1)`
  );
  openDatabaseConnection().driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at, content_hash, snapshot_json
     ) VALUES ('desktop#1', 'node-delete', NULL, 'desktop-source',
       '2026-05-04T08:00:00.000Z', 'node-delete-hash-1', '{"id":"node-delete","title":"Article To Delete"}')`
  );
}

function markSourceNodeDeleted() {
  openDatabaseConnection().driver.execute(
    `UPDATE nodes
     SET title = 'Deleted Article', current_version_id = 'desktop#delete',
       updated_at = '2026-05-04T08:05:00.000Z', deleted_at = '2026-05-04T08:05:00.000Z'
     WHERE id = 'node-delete'`
  );
  openDatabaseConnection().driver.execute(
    `UPDATE sync_object_state
     SET state_seq = 2, current_version_id = 'desktop#delete', content_hash = 'node-delete-hash-2',
       updated_at = '2026-05-04T08:05:00.000Z', deleted_at = '2026-05-04T08:05:00.000Z', sync_dirty = 1
     WHERE object_type = 'node' AND object_id = 'node-delete'`
  );
  openDatabaseConnection().driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at, content_hash, snapshot_json
     ) VALUES ('desktop#delete', 'node-delete', 'desktop#1', 'desktop-source',
       '2026-05-04T08:05:00.000Z', 'node-delete-hash-2', '{"id":"node-delete","title":"Deleted Article"}')`
  );
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
