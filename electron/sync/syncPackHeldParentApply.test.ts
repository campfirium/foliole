// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '/tmp/foliole-held-parent-tests';
let tempRoot = '';
let incomingPath = '';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({ app_data_dir: appDataDir,
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_log_dir: path.join(appDataDir, 'logs') })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncPackNodeSurfaceWithDbPort } from '../../lib/core/sync/syncPackNodeApplyExecutor.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

import { createIncomingPack, installLocalNodeFixtures } from './syncPackNodeApplyTestSupport.js';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-held-parent-'));
  appDataDir = path.join(tempRoot, 'app-data');
  incomingPath = path.join(tempRoot, 'incoming.db');
  initializeDatabaseConnection(openDatabaseConnection());
  installLocalNodeFixtures();
  createIncomingPack(incomingPath);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies a new head when the pack omits an already held parent body', async () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`INSERT INTO nodes
    (id, kind, title, content, current_version_id, created_at, updated_at)
    VALUES ('node-1', 'topic', 'Packed Node', '', 'desktop#1',
      '2026-05-04T01:00:00.000Z', '2026-05-04T01:00:00.000Z');
    UPDATE sync_object_state SET current_version_id = 'desktop#1'
      WHERE object_type = 'node' AND object_id = 'node-1';
    INSERT INTO node_sync_versions
    (version_id, object_id, parent_version_id, host_name, created_at, content_hash, snapshot_json)
    VALUES ('desktop#1', 'node-1', NULL, 'desktop', '2026-05-04T01:00:00.000Z',
      'hash-node-1', '{"id":"node-1","title":"Packed Node"}')`);
  const incoming = new Database(incomingPath);
  try {
    incoming.exec(`DELETE FROM node_sync_versions WHERE version_id = 'desktop#1';
      INSERT INTO node_sync_versions
      (version_id, object_id, parent_version_id, host_name, created_at, content_hash, snapshot_json)
      VALUES ('desktop#2', 'node-1', 'desktop#1', 'desktop', '2026-05-04T02:00:00.000Z',
        'hash-node-2', '{"id":"node-1","title":"Packed Node"}');
      INSERT INTO node_sync_version_parents VALUES ('desktop#2', 'desktop#1', 0);
      UPDATE nodes SET current_version_id = 'desktop#2' WHERE id = 'node-1';`);
  } finally { incoming.close(); }
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'held-parent-apply-test' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeSurfaceWithDbPort(port, {
      currentCursor: 0, hostName: 'Android test host'
    });
  } finally { await port.run('DETACH DATABASE inc'); }
  expect(connection.sqlite.prepare(
    "SELECT current_version_id FROM nodes WHERE id = 'node-1'"
  ).get()).toEqual({ current_version_id: 'desktop#2' });
  expect(connection.sqlite.prepare(
    "SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = 'desktop#2'"
  ).get()).toEqual({ parent_version_id: 'desktop#1' });
});
