// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '/tmp/foliole-sync-pack-tombstones';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { createIncomingPack, installLocalNodeFixtures } from './syncPackNodeApplyTestSupport.js';

const deletedAt = '2026-05-05T00:00:00.000Z';
let incomingPath = '';
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-tombstone-'));
  appDataDir = path.join(tempRoot, 'app-data');
  incomingPath = path.join(tempRoot, 'incoming.db');
  initializeDatabaseConnection(openDatabaseConnection());
  installLocalNodeFixtures();
  createIncomingPack(incomingPath);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertTombstone(db: Database.Database) {
  db.prepare(`INSERT INTO node_sync_tombstones (
    node_id, version_id, parent_version_id, host_name, content_hash,
    snapshot_json, deleted_at, created_at
  ) VALUES ('node-1', 'desktop#deleted', 'desktop#1', 'desktop', 'deleted-hash', ?, ?, ?)`)
    .run(JSON.stringify({ id: 'node-1', deleted_at: deletedAt }), deletedAt, deletedAt);
}

async function apply(currentCursor: number) {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-pack-tombstone-apply' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    return await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor, hostName: 'desktop' });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
}

it('keeps a locally deleted node deleted when a peer sends its old active version', async () => {
  const local = openDatabaseConnection().sqlite;
  insertTombstone(local);
  local.prepare(`UPDATE sync_object_state SET content_hash = 'deleted-hash',
    current_version_id = 'desktop#deleted', deleted_at = ?, sync_dirty = 0
    WHERE object_type = 'node' AND object_id = 'node-1'`).run(deletedAt);

  await expect(apply(0)).resolves.toMatchObject({ applied: true, toStateSeq: 1 });

  expect(local.prepare("SELECT id FROM nodes WHERE id = 'node-1'").get()).toBeUndefined();
  expect(local.prepare("SELECT deleted_at FROM sync_object_state WHERE object_type = 'node' AND object_id = 'node-1'").get())
    .toEqual({ deleted_at: deletedAt });
});

it('applies an old peer deletion even when the ordinary state cursor is already current', async () => {
  const local = openDatabaseConnection().sqlite;
  local.prepare(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('node-1', 'topic', 'Old peer copy', '', ?, ?)`).run(deletedAt, deletedAt);
  const incoming = new Database(incomingPath);
  try {
    incoming.exec("DELETE FROM nodes; DELETE FROM node_sync_versions; DELETE FROM sync_object_state WHERE object_type = 'node'");
    insertTombstone(incoming);
  } finally {
    incoming.close();
  }

  await expect(apply(1)).resolves.toMatchObject({ applied: false, toStateSeq: 1 });

  expect(local.prepare("SELECT id FROM nodes WHERE id = 'node-1'").get()).toBeUndefined();
  expect(local.prepare("SELECT deleted_at FROM node_sync_tombstones WHERE node_id = 'node-1'").get())
    .toEqual({ deleted_at: deletedAt });
});

it('applies parent and child deletions in foreign-key-safe order', async () => {
  const local = openDatabaseConnection().sqlite;
  local.prepare(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('node-1', 'topic', 'Parent', '', ?, ?)`).run(deletedAt, deletedAt);
  local.prepare(`INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
    VALUES ('node-2', 'node-1', 'topic', 'Child', '', ?, ?)`).run(deletedAt, deletedAt);
  const incoming = new Database(incomingPath);
  try {
    incoming.exec("DELETE FROM nodes; DELETE FROM node_sync_versions; DELETE FROM sync_object_state WHERE object_type = 'node'");
    insertTombstone(incoming);
    incoming.prepare(`INSERT INTO node_sync_tombstones (
      node_id, version_id, parent_version_id, host_name, content_hash,
      snapshot_json, deleted_at, created_at
    ) VALUES ('node-2', 'desktop#child-deleted', NULL, 'desktop', 'child-deleted-hash', ?, ?, ?)`).run(
      JSON.stringify({ id: 'node-2', parent_id: 'node-1', deleted_at: deletedAt }), deletedAt, deletedAt
    );
  } finally {
    incoming.close();
  }

  await expect(apply(1)).resolves.toMatchObject({
    applied: false, appliedTombstoneNodeIds: ['node-2', 'node-1']
  });
  expect(local.prepare("SELECT id FROM nodes WHERE id IN ('node-1', 'node-2')").all()).toEqual([]);
});
