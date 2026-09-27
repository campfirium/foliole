// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '/tmp/foliole-parent-child-order-migration';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { restoreNodes } from '../../lib/core/database/nodeMutations.js';
import { ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-order-migration-'));
  appDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createNode(id: string) {
  upsertNodeSnapshot({
    nodeId: id, parentNodeId: null, kind: 'topic', title: id,
    isTitleManual: true, content: '', reveal: null, anchorLink: null,
    createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z'
  });
}

function prepareOldOrder(ids: string[]) {
  const db = openDatabaseConnection().sqlite;
  db.exec("DELETE FROM parent_child_order; DELETE FROM sync_object_state WHERE object_type = 'parent_child_order'");
  const insert = db.prepare('INSERT INTO node_order (node_id, position) VALUES (?, ?)');
  insert.run('special-inbox', 0);
  insert.run('special-virtual-root', 1);
  ids.forEach((id, index) => insert.run(id, index + 2));
  db.pragma('user_version = 104');
  return db;
}

it('keeps old versions and appends a legacy trash node only when restored', () => {
  createNode('node-a');
  createNode('node-b');
  createNode('old-trash');
  const db = prepareOldOrder(['node-b', 'node-a']);
  db.prepare("UPDATE nodes SET deleted_at = '2026-05-02T00:00:00.000Z' WHERE id = 'old-trash'").run();
  db.prepare(`INSERT INTO node_sync_versions (
    version_id, object_id, host_name, created_at, content_hash, snapshot_json
  ) VALUES ('old-version', 'node-a', 'old-host', '2026-05-01T00:00:00.000Z', 'old-hash', '{"position":7}')`).run();

  initializeDatabaseSchema(db);

  const rows = db.prepare('SELECT parent_id, child_ids_json FROM parent_child_order WHERE parent_id = ?')
    .get(ROOT_CHILD_ORDER_ID) as { child_ids_json: string };
  expect(JSON.parse(rows.child_ids_json)).toEqual([
    'special-inbox', 'special-virtual-root', 'node-b', 'node-a'
  ]);
  const beforeRestoreState = db.prepare(
    "SELECT content_hash FROM sync_object_state WHERE object_type = 'parent_child_order' AND object_id = ?"
  ).get(ROOT_CHILD_ORDER_ID) as { content_hash: string };
  expect(db.prepare("SELECT snapshot_json FROM node_sync_versions WHERE version_id = 'old-version'").get())
    .toEqual({ snapshot_json: '{"position":7}' });
  expect(restoreNodes(openDatabaseConnection().driver, { nodeIds: ['old-trash'] }).restoredNodeIds)
    .toEqual(['old-trash']);
  const restoredOrder = db.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?')
    .get(ROOT_CHILD_ORDER_ID) as { child_ids_json: string };
  expect(JSON.parse(restoredOrder.child_ids_json)).toEqual([
    'special-inbox', 'special-virtual-root', 'node-b', 'node-a', 'old-trash'
  ]);
  expect(db.prepare("SELECT deleted_at FROM nodes WHERE id = 'old-trash'").get())
    .toEqual({ deleted_at: null });
  const restoredState = db.prepare(
    "SELECT content_hash, sync_dirty FROM sync_object_state WHERE object_type = 'parent_child_order' AND object_id = ?"
  ).get(ROOT_CHILD_ORDER_ID) as { content_hash: string; sync_dirty: number };
  expect(restoredState.content_hash).not.toBe(beforeRestoreState.content_hash);
  expect(restoredState.sync_dirty).toBe(1);
  expect(db.pragma('user_version', { simple: true })).toBe(105);
});

it('rolls back when an active node has no reliable old order row', () => {
  createNode('missing-active');
  const db = prepareOldOrder([]);
  expect(() => initializeDatabaseSchema(db)).toThrow('missing_active_node_order:missing-active');
  expect(db.pragma('user_version', { simple: true })).toBe(104);
  expect(db.prepare('SELECT COUNT(*) AS count FROM parent_child_order').get()).toEqual({ count: 0 });
});
