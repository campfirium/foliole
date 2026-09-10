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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-api-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function prepareV80() {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`DROP TABLE readwise_api_import_stage;
    DROP TABLE readwise_api_import_runs;
    ALTER TABLE import_sources DROP COLUMN remote_import_state_json;`);
  connection.sqlite.pragma('user_version = 80');
  return connection;
}

it('adds restart-safe API staging and synced materialization state', () => {
  const connection = prepareV80();
  initializeDatabaseSchema(connection.sqlite);
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(84);
  expect(connection.sqlite.prepare(
    "SELECT name FROM pragma_table_info('import_sources') WHERE name='remote_import_state_json'"
  ).get()).toEqual({ name: 'remote_import_state_json' });
  expect(connection.sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='readwise_api_import_stage'"
  ).get()).toEqual({ name: 'readwise_api_import_stage' });
});

it('rolls back all v81 API state when migration commit fails', () => {
  const connection = prepareV80();
  expect(() => initializeDatabaseSchema(connection.sqlite, {
    beforeVersionCommit: () => { throw new Error('injected API migration failure'); }
  })).toThrow('injected API migration failure');
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(80);
  expect(connection.sqlite.prepare(
    "SELECT name FROM pragma_table_info('import_sources') WHERE name='remote_import_state_json'"
  ).get()).toBeUndefined();
  expect(connection.sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='readwise_api_import_stage'"
  ).get()).toBeUndefined();
});
