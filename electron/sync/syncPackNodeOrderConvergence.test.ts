// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('keeps the order of a newly accepted versioned node', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'new-node-order' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0, hostName: 'receiver' });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  expect(connection.sqlite.prepare('SELECT position FROM node_order WHERE node_id = ?').get('node-1'))
    .toEqual({ position: 5 });
});

it('restores a missing order row from the accepted version during ordinary replay', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'replay-node-order' });
  await port.run(`ATTACH DATABASE '${incomingPath.replaceAll("'", "''")}' AS inc`);
  try {
    await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 0, hostName: 'receiver' });
    connection.sqlite.prepare(
      `UPDATE node_sync_versions SET snapshot_json = json_set(snapshot_json, '$.position', 5)
       WHERE version_id = 'desktop#1'`
    ).run();
    connection.sqlite.prepare('DELETE FROM node_order WHERE node_id = ?').run('node-1');
    await applySyncPackNodeSurfaceWithDbPort(port, { currentCursor: 1, hostName: 'receiver' });
  } finally {
    await port.run('DETACH DATABASE inc');
  }
  expect(connection.sqlite.prepare('SELECT position FROM node_order WHERE node_id = ?').get('node-1'))
    .toEqual({ position: 5 });
});
