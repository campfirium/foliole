// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'), app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir, app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-reconcile-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function prepareV82() {
  const connection = openDatabaseConnection();
  connection.sqlite.exec('DROP TABLE readwise_api_reconcile_stage; DROP TABLE readwise_api_reconcile_runs;');
  connection.sqlite.pragma('user_version = 82');
  return connection;
}

it('adds restart-safe remote reconciliation state', () => {
  const connection = prepareV82();
  initializeDatabaseSchema(connection.sqlite);
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(83);
  expect(connection.sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'readwise_api_reconcile_%' ORDER BY name"
  ).all()).toEqual([
    { name: 'readwise_api_reconcile_runs' }, { name: 'readwise_api_reconcile_stage' }
  ]);
});

it('rolls back both reconcile tables when the v83 commit fails', () => {
  const connection = prepareV82();
  expect(() => initializeDatabaseSchema(connection.sqlite, {
    beforeVersionCommit: () => { throw new Error('injected reconcile migration failure'); }
  })).toThrow('injected reconcile migration failure');
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(82);
  expect(connection.sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'readwise_api_reconcile_%'"
  ).all()).toEqual([]);
});
