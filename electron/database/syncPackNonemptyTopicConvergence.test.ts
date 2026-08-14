// @vitest-environment node

import { promises as fs } from 'node:fs';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-nonempty-topic-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-nonempty-topic-'));
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps both bodies when a pack joins a nonempty topic branch', async () => {
  const incomingPath = await buildIncomingBranchPack();
  openLibrary('target');
  insertBranch('target', 'branch-a', 'Local body', '2026-08-14T01:02:00.000Z');
  const reverseIncomingPath = await buildCurrentPack('branch-a-pack', 'target-device', 'source-device');
  closeDatabaseConnection();
  const target = await applyConflictPack('target', incomingPath, 'target-device', true);
  expect(target.current_version_id).toMatch(/^resolution#/);
  expect(target.parents).toEqual(['branch-a', 'branch-b']);
  const alternative = target.alternative;
  expect(new Set([alternative.body_text, target.projection.content])).toEqual(
    new Set(['Local body', 'Remote body'])
  );
  expect(alternative.status).toBe('available');
  const source = await applyConflictPack('source', reverseIncomingPath, 'source-device', false);
  expect(source).toEqual(target);
  const reopened = openLibrary('target');
  expect(reopened.sqlite.prepare(
    `SELECT COUNT(*) AS count FROM node_sync_versions
     WHERE object_id = 'shared-topic'`
  ).get()).toEqual({ count: 4 });
  expect(reopened.sqlite.prepare(
    `SELECT COUNT(*) AS count FROM node_text_alternatives
     WHERE node_id = 'shared-topic' AND status = 'available'`
  ).get()).toEqual({ count: 1 });
});

async function applyConflictPack(
  library: string,
  incomingPath: string,
  deviceId: string,
  replay: boolean
) {
  const connection = openLibrary(library);
  const port = createBetterSqliteDbPort(connection.sqlite, { name: `nonempty-topic-${library}` });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      deviceId
    })).resolves.toMatchObject({ handledConflictCount: 1, toStateSeq: 1 });
    if (replay) {
      await expect(applySyncPackNodeSurfaceWithDbPort(port, {
        currentCursor: 1,
        deviceId
      })).resolves.toMatchObject({ applied: false, handledConflictCount: 0 });
    }
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  const current = connection.sqlite.prepare(
    `SELECT current_version_id FROM nodes WHERE id = 'shared-topic'`
  ).get() as { current_version_id: string };
  const parents = (connection.sqlite.prepare(
    `SELECT parent_version_id AS id FROM node_sync_version_parents
     WHERE version_id = ? ORDER BY parent_version_id`
  ).all(current.current_version_id) as Array<{ id: string }>).map((row) => row.id);
  const alternative = connection.sqlite.prepare(
    `SELECT body_text, status FROM node_text_alternatives WHERE node_id = 'shared-topic'`
  ).get() as { body_text: string; status: string };
  const projection = connection.sqlite.prepare(
    `SELECT content FROM nodes WHERE id = 'shared-topic'`
  ).get() as { content: string };
  closeDatabaseConnection();
  return { alternative, current_version_id: current.current_version_id, parents, projection };
}

async function buildCurrentPack(packId: string, fromDeviceId: string, toPeerId: string) {
  const packPath = path.join(tempRoot, `${packId}.syncpack`);
  await buildDesktopSyncPack({
    createdAt: '2026-08-14T01:04:00.000Z',
    fromDeviceId,
    fromStateSeq: 0,
    outputPath: packPath,
    packId,
    toPeerId
  });
  const incomingPath = path.join(tempRoot, `${packId}.db`);
  fsSync.writeFileSync(incomingPath, inflateSync(
    readZipEntries(packPath).get('incoming.db.deflate') ?? Buffer.alloc(0)
  ));
  return incomingPath;
}

async function buildIncomingBranchPack() {
  openLibrary('source');
  insertBranch('source', 'branch-b', 'Remote body', '2026-08-14T01:03:00.000Z');
  const packPath = path.join(tempRoot, 'branch-b.syncpack');
  await buildDesktopSyncPack({
    createdAt: '2026-08-14T01:04:00.000Z',
    fromDeviceId: 'source-device',
    fromStateSeq: 0,
    outputPath: packPath,
    packId: 'branch-b-pack',
    toPeerId: 'target-device'
  });
  closeDatabaseConnection();
  const incomingPath = path.join(tempRoot, 'branch-b.db');
  fsSync.writeFileSync(incomingPath, inflateSync(
    readZipEntries(packPath).get('incoming.db.deflate') ?? Buffer.alloc(0)
  ));
  return incomingPath;
}

function openLibrary(name: string) {
  mockedAppDataDir = path.join(tempRoot, name);
  initializeDatabaseConnection(openDatabaseConnection());
  openDatabaseConnection().sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sync_push_ack (
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

function insertBranch(device: string, versionId: string, body: string, updatedAt: string) {
  const db = openDatabaseConnection().sqlite;
  db.prepare(
    `INSERT INTO nodes (
       id, kind, title, is_title_manual, hide_title_heading, content,
       current_version_id, created_at, updated_at
     ) VALUES ('shared-topic', 'topic', 'Shared Topic', 1, 0, ?, ?, ?, ?)`
  ).run(body, versionId, '2026-08-14T01:00:00.000Z', updatedAt);
  const baseSnapshot = snapshot('Base body', '2026-08-14T01:00:00.000Z');
  const branchSnapshot = snapshot(body, updatedAt);
  db.prepare(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at,
       content_hash, body_text, snapshot_json
     ) VALUES (?, 'shared-topic', ?, ?, ?, ?, ?, ?)`
  ).run('base', null, 'origin', '2026-08-14T01:00:00.000Z', 'base-hash', 'Base body', JSON.stringify(baseSnapshot));
  db.prepare(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at,
       content_hash, body_text, snapshot_json
     ) VALUES (?, 'shared-topic', 'base', ?, ?, ?, ?, ?)`
  ).run(versionId, device, updatedAt, `${versionId}-hash`, body, JSON.stringify(branchSnapshot));
  db.prepare(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'shared-topic', 1, ?, ?, ?, ?, 1)`
  ).run(versionId, `${versionId}-hash`, device, updatedAt);
}

function snapshot(content: string, updatedAt: string) {
  return {
    anchor_link: null, attachments: [], content, created_at: '2026-08-14T01:00:00.000Z',
    deleted_at: null, desired_retention: null, hide_title_heading: false, id: 'shared-topic',
    image_regions: null, is_title_manual: true, kind: 'topic', opening_text: null,
    parent_id: null, position: null, priority: null, reveal: null, title: 'Shared Topic',
    updated_at: updatedAt, virtual_filter: null
  };
}

function readZipEntries(filePath: string) {
  const buffer = fsSync.readFileSync(filePath);
  const entries = new Map<string, Buffer>();
  for (let offset = 0; buffer.readUInt32LE(offset) === 0x04034b50;) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const contentStart = nameStart + nameLength + extraLength;
    entries.set(buffer.subarray(nameStart, nameStart + nameLength).toString('utf8'),
      buffer.subarray(contentStart, contentStart + size));
    offset = contentStart + size;
  }
  return entries;
}
