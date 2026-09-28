// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '/tmp/foliole-sync-pack-order-tests';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { createIncomingPack, installLocalNodeFixtures } from './syncPackNodeApplyTestSupport.js';

let incomingPath = '';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-order-'));
  appDataDir = path.join(tempRoot, 'app-data');
  incomingPath = path.join(tempRoot, 'incoming.db');
  initializeDatabaseConnection(openDatabaseConnection());
  installLocalNodeFixtures();
  createIncomingPack(incomingPath);
  const incoming = new Database(incomingPath);
  incoming.prepare("UPDATE pack_manifest SET value = ? WHERE key = 'manifest_json'")
    .run(JSON.stringify({ source_epoch: 'source-test', frontier_state_seq: 3,
      from_state_seq: 0, to_state_seq: 3 }));
  incoming.prepare(`INSERT INTO sync_object_state (
    object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at, deleted_at
  ) VALUES ('parent_child_order', ?, 3, 'order-hash', 'desktop-host', '2026-05-04T01:02:00.000Z', NULL)`)
    .run(ROOT_CHILD_ORDER_ID);
  incoming.prepare(`INSERT INTO sync_objects (
    object_type, object_id, content_hash, payload_json, updated_at, deleted_at
  ) VALUES ('parent_child_order', ?, 'order-hash', ?, '2026-05-04T01:02:00.000Z', NULL)`)
    .run(ROOT_CHILD_ORDER_ID, JSON.stringify({
      parent_id: ROOT_CHILD_ORDER_ID, child_ids_json: '["node-1"]'
    }));
  incoming.close();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('applies a parent sequence independently of the article version', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'new-node-order' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0, hostName: 'receiver' });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  expect(connection.sqlite.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?')
    .get(ROOT_CHILD_ORDER_ID)).toEqual({ child_ids_json: '["node-1"]' });
});

it('does not reconstruct retired ranking from article history during replay', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'replay-node-order' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0, hostName: 'receiver' });
    connection.sqlite.prepare(
      `UPDATE node_sync_versions SET snapshot_json = json_set(snapshot_json, '$.position', 5)
       WHERE version_id = 'desktop#1'`
    ).run();
    await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 3, hostName: 'receiver' });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM node_order').get()).toEqual({ count: 0 });
  expect(connection.sqlite.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?')
    .get(ROOT_CHILD_ORDER_ID)).toEqual({ child_ids_json: '["node-1"]' });
});
