// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-shared-core-node-view-state-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { migrateNumberedFixtureTo } from './numberedMigrationTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-shared-core-node-view-state-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('migrates node view state to device-scoped rows', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
    INSERT INTO settings (key, value, updated_at)
    VALUES ('desktop_device_id', '"desktop-test"', '2026-04-27T00:00:00.000Z');
    CREATE TABLE node_view_state (
      node_id TEXT PRIMARY KEY,
      scroll_top INTEGER NOT NULL DEFAULT 0,
      selection_from INTEGER,
      selection_to INTEGER,
      updated_at TEXT NOT NULL
    );
    INSERT INTO node_view_state (node_id, scroll_top, selection_from, selection_to, updated_at)
    VALUES ('node-1', 42, 4, 8, '2026-04-27T00:01:00.000Z');
  `);
  connection.sqlite.pragma('user_version = 30');

  migrateNumberedFixtureTo(connection.sqlite, 31);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(31);
  expect(connection.sqlite.prepare('SELECT node_id, device_id, scroll_top FROM node_view_state').get()).toEqual({
    device_id: 'desktop-test',
    node_id: 'node-1',
    scroll_top: 42
  });
});

it('adds source to device-scoped node view state rows', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE node_view_state (
      node_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      scroll_top INTEGER NOT NULL DEFAULT 0,
      selection_from INTEGER,
      selection_to INTEGER,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (node_id, device_id)
    );
    INSERT INTO node_view_state (node_id, device_id, scroll_top, selection_from, selection_to, updated_at)
    VALUES ('node-1', 'desktop-test', 42, NULL, NULL, '2026-04-30T00:00:00.000Z');
  `);
  connection.sqlite.pragma('user_version = 32');

  migrateNumberedFixtureTo(connection.sqlite, 33);

  expect(connection.sqlite
    .prepare('SELECT source FROM node_view_state WHERE node_id = ? AND device_id = ?')
    .get('node-1', 'desktop-test')).toEqual({ source: 'user-scroll' });
});
