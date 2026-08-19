// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-learning-state-e2e-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-learning-e2e-'));
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('builds and applies a desktop learning-state pack after its node row', async () => {
  const packPath = await buildLearningOnlyDesktopPack();
  const incomingPath = extractIncomingPack(packPath, path.join(tempRoot, 'incoming-learning.db'));
  const target = openTargetDatabase();
  const port = createBetterSqliteDbPort(target.sqlite, { name: 'learning-state-e2e-target' });

  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      hostName: 'android-target'
    })).resolves.toMatchObject({
      applied: true,
      appliedObjectCount: 2,
      fromStateSeq: 0,
      toStateSeq: 2
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(target.sqlite.prepare('SELECT title FROM nodes WHERE id = ?').get('node-reading-1')).toEqual({
    title: 'Reading Topic'
  });
  expect(target.sqlite.prepare('SELECT state FROM node_reading WHERE node_id = ?').get('node-reading-1')).toEqual({
    state: 'active'
  });
  expect(target.sqlite.prepare(
    `SELECT object_type, object_id FROM sync_object_state
     WHERE object_type = 'node_reading' AND object_id = 'node-reading-1'`
  ).get()).toEqual({ object_id: 'node-reading-1', object_type: 'node_reading' });
});

it('prunes packed learning rows for live children hidden under deleted parents', async () => {
  const packPath = await buildHiddenChildLearningDesktopPack();
  const incomingPath = extractIncomingPack(packPath, path.join(tempRoot, 'incoming-hidden-child.db'));
  const target = openTargetDatabase();
  const port = createBetterSqliteDbPort(target.sqlite, { name: 'hidden-child-learning-target' });

  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      hostName: 'android-target'
    })).resolves.toMatchObject({
      applied: true,
      fromStateSeq: 0,
      toStateSeq: 3
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(target.sqlite.prepare('SELECT parent_id, deleted_at FROM nodes WHERE id = ?').get('hidden-child')).toEqual({
    deleted_at: null,
    parent_id: 'deleted-parent'
  });
  expect(target.sqlite.prepare('SELECT node_id FROM node_reading WHERE node_id = ?').get('hidden-child')).toBeUndefined();
});

async function buildLearningOnlyDesktopPack() {
  mockedAppDataDir = path.join(tempRoot, 'source-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  insertSourceLearningState();
  const packPath = path.join(tempRoot, 'desktop-learning-only.syncpack');
  await buildDesktopSyncPack({
    createdAt: '2026-05-06T10:00:00.000Z',
    fromDeviceId: 'desktop-source',
    fromStateSeq: 0,
    outputPath: packPath,
    packId: 'desktop-learning-only',
    toPeerId: 'android-target'
  });
  closeDatabaseConnection();
  return packPath;
}

async function buildHiddenChildLearningDesktopPack() {
  mockedAppDataDir = path.join(tempRoot, 'hidden-source-app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  insertHiddenChildLearningState();
  const packPath = path.join(tempRoot, 'desktop-hidden-child-learning.syncpack');
  await buildDesktopSyncPack({
    createdAt: '2026-05-06T11:00:00.000Z',
    fromDeviceId: 'desktop-source',
    fromStateSeq: 0,
    outputPath: packPath,
    packId: 'desktop-hidden-child-learning',
    toPeerId: 'android-target'
  });
  closeDatabaseConnection();
  return packPath;
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

function insertSourceLearningState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-reading-1', 'topic', 'Reading Topic', '', '2026-05-06T09:00:00.000Z', '2026-05-06T09:00:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node', 'node-reading-1', 1, 'node-hash',
       'desktop-source', '2026-05-06T09:00:00.000Z', 1)`
  );
  driver.execute(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
       next_at, priority, repetition_count, state
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['node-reading-1', 120000, 1.5, '2026-05-06T09:05:00.000Z',
      '2026-05-07T09:05:00.000Z', 0.75, 2, 'active']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node_reading', 'node-reading-1', 2, 'reading-hash',
       'desktop-source', '2026-05-06T09:05:00.000Z', 1)`
  );
}

function insertHiddenChildLearningState() {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at, deleted_at)
     VALUES ('deleted-parent', 'folder', 'Deleted Parent', '', '2026-05-06T10:00:00.000Z',
       '2026-05-06T10:10:00.000Z', '2026-05-06T10:10:00.000Z')`
  );
  driver.execute(
    `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
     VALUES ('hidden-child', 'deleted-parent', 'topic', 'Hidden Child', '', '2026-05-06T10:05:00.000Z',
       '2026-05-06T10:15:00.000Z')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at, sync_dirty
     ) VALUES
       ('node', 'deleted-parent', 1, 'deleted-parent-hash', 'desktop-source',
         '2026-05-06T10:10:00.000Z', '2026-05-06T10:10:00.000Z', 1),
       ('node', 'hidden-child', 2, 'hidden-child-hash', 'desktop-source',
         '2026-05-06T10:15:00.000Z', NULL, 1)`
  );
  driver.execute(
    `INSERT INTO node_reading (
       node_id, interval_duration_ms, interval_growth_factor, last_handled_at,
       next_at, priority, repetition_count, state
     ) VALUES ('hidden-child', 120000, 1.5, '2026-05-06T10:16:00.000Z',
       '2026-05-07T10:16:00.000Z', 0.75, 2, 'active')`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, sync_dirty
     ) VALUES ('node_reading', 'hidden-child', 3, 'hidden-child-reading-hash',
       'desktop-source', '2026-05-06T10:16:00.000Z', 1)`
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
