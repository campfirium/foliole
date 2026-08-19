// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-node-apply-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import {
  applySyncPackNodesWithDbPort,
  applySyncPackNodeSurfaceWithDbPort
} from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { createIncomingPack, installLocalNodeFixtures } from './syncPackNodeApplyTestSupport.js';

let incomingPath = '';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-node-apply-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  incomingPath = path.join(tempRoot, 'incoming.db');
  initializeDatabaseConnection(openDatabaseConnection());
  installLocalNodeFixtures();
  createIncomingPack(incomingPath);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('applies nodes and node attachments from an attached sync pack', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-apply-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodesWithDbPort(port);
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare('SELECT title, reveal, current_version_id FROM nodes WHERE id = ?').get('node-1')).toEqual({
    current_version_id: 'desktop#1',
    reveal: 'Packed answer',
    title: 'Packed Node'
  });
  expect(connection.sqlite.prepare('SELECT node_id, position FROM node_order WHERE node_id = ?').get('node-1')).toEqual({
    node_id: 'node-1',
    position: 5
  });
  expect(connection.sqlite.prepare('SELECT node_id, attachment_id, role FROM node_attachments').all()).toEqual([{
    attachment_id: 'att-1',
    node_id: 'node-1',
    role: 'reference'
  }]);
});

it('skips pack node attachment links when the attachment metadata is missing locally', async () => {
  const connection = openDatabaseConnection();
  connection.sqlite.prepare('DELETE FROM attachments WHERE id = ?').run('att-1');
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-missing-attachment-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodesWithDbPort(port);
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare('SELECT title FROM nodes WHERE id = ?').get('node-1')).toEqual({
    title: 'Packed Node'
  });
  expect(connection.sqlite.prepare('SELECT node_id, attachment_id, role FROM node_attachments').all()).toEqual([]);
});

it('applies pack nodes only when the attached pack cursor is contiguous', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-surface-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      deviceId: 'android-device',
      hostName: 'Android test host'
    })).resolves.toMatchObject({
      applied: true,
      appliedObjectCount: 2,
      fromStateSeq: 0,
      toStateSeq: 1
    });
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 1,
      deviceId: 'android-device',
      hostName: 'Android test host'
    })).resolves.toMatchObject({
      appliedObjectCount: 0,
      applied: false,
      toStateSeq: 1
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare(
    `SELECT current_version_id, last_modified_by_device_id, sync_dirty
     FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-1'`
  ).get()).toEqual({
    current_version_id: 'desktop#1',
    last_modified_by_device_id: 'android-device',
    sync_dirty: 0
  });
  expect(connection.sqlite.prepare(
    `SELECT object_id FROM sync_object_state
     WHERE object_type = 'setting' AND object_id = 'host:android:phone:Android test host:theme'`
  ).get()).toEqual({ object_id: 'host:android:phone:Android test host:theme' });
  expect(connection.sqlite.prepare(
    "SELECT snapshot_json FROM node_sync_versions WHERE version_id = 'desktop#1'"
  ).get()).toEqual({ snapshot_json: '{"id":"node-1","title":"Packed Node"}' });
  expect(connection.sqlite.prepare(
    `SELECT value_json FROM setting_records
     WHERE scope = 'host' AND platform = 'android' AND form_factor = 'phone'
       AND host_name = 'Android test host' AND key = 'theme'`
  ).get()).toEqual({ value_json: '{"mode":"dark"}' });
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_delivery_receipts').get()).toEqual({ count: 0 });
});

it('does not apply live node state rows when the pack has no node payload', async () => {
  const connection = openDatabaseConnection();
  const db = new Database(incomingPath);
  try {
    db.prepare('DELETE FROM nodes WHERE id = ?').run('node-1');
    db.prepare('DELETE FROM node_sync_versions WHERE object_id = ?').run('node-1');
  } finally {
    db.close();
  }
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-orphan-state-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      deviceId: 'android-device',
      hostName: 'Android test host'
    });
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  expect(connection.sqlite.prepare(
    `SELECT current_version_id, sync_dirty FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-1'`
  ).get()).toEqual({
    current_version_id: 'android#local',
    sync_dirty: 0
  });
  expect(connection.sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get('node-1')).toBeUndefined();
});

it.each([
  ['missing parent', "INSERT INTO node_sync_version_parents VALUES ('desktop#1', 'missing#1', 0)"],
  ['cycle', "INSERT INTO node_sync_version_parents VALUES ('desktop#1', 'desktop#1', 0)"],
  ['invalid snapshot', "UPDATE node_sync_versions SET snapshot_json = 'not-json'"],
  ['dangling current pointer', "UPDATE nodes SET current_version_id = 'missing#head'"]
])('rejects %s without polluting nodes, versions, cursor state, or acks', async (_label, mutation) => {
  const connection = openDatabaseConnection();
  const incoming = new Database(incomingPath);
  try {
    incoming.exec(mutation);
  } finally {
    incoming.close();
  }
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-version-rejection-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      deviceId: 'android-device'
    })).rejects.toThrow(/sync_pack_node_/);
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  expect(connection.sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get('node-1')).toBeUndefined();
  expect(connection.sqlite.prepare('SELECT version_id FROM node_sync_versions WHERE version_id = ?').get('desktop#1')).toBeUndefined();
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM sync_delivery_receipts').get()).toEqual({ count: 0 });
});

it('rejects cross-object ancestry and immutable duplicate mismatches', async () => {
  const connection = openDatabaseConnection();
  const incoming = new Database(incomingPath);
  try {
    incoming.exec(`
      INSERT INTO node_sync_versions (
        version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
      ) VALUES ('desktop#other', 'other-node', NULL, 'desktop',
        '2026-05-04T00:00:00.000Z', 'other-hash', '{"id":"other-node"}');
      INSERT INTO node_sync_version_parents (version_id, parent_version_id, ordinal)
      VALUES ('desktop#1', 'desktop#other', 0);
    `);
  } finally {
    incoming.close();
  }
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-node-version-cross-object-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      deviceId: 'android-device'
    })).rejects.toThrow('sync_pack_node_version_cross_object');
  } finally {
    await port.run('DETACH DATABASE inc');
  }

  connection.sqlite.prepare(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-1', 'topic', 'Local Node', '',
       '2026-05-04T00:00:00.000Z', '2026-05-04T00:00:00.000Z')`
  ).run();
  connection.sqlite.prepare(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, device_id, created_at, content_hash, snapshot_json
     ) VALUES ('desktop#1', 'node-1', NULL, 'desktop',
       '2026-05-04T01:00:00.000Z', 'different-hash', '{"id":"node-1"}')`
  ).run();
  incomingPath = path.join(tempRoot, 'immutable-incoming.db');
  createIncomingPack(incomingPath);
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await expect(applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0,
      deviceId: 'android-device'
    })).rejects.toThrow('sync_pack_node_version_immutable_mismatch');
  } finally {
    await port.run('DETACH DATABASE inc');
  }
});
