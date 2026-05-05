// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-driver-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { withTransaction } from './transaction.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-driver-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('exposes execute and query helpers without leaking better-sqlite3 types', () => {
  const connection = openDatabaseConnection();

  const insertResult = connection.driver.execute(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
    ['driver_test', '{"ok":true}', '2026-03-14T00:00:00.000Z']
  );
  const row = connection.driver.queryOne<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['driver_test']
  );
  const rows = connection.driver.queryAll<{ key: string }>('SELECT key FROM settings ORDER BY key ASC');

  expect(insertResult.changes).toBe(1);
  expect(row).toEqual({ value: '{"ok":true}' });
  expect(rows.some((entry) => entry.key === 'driver_test')).toBe(true);
});

it('runs withTransaction through the driver contract', () => {
  const connection = openDatabaseConnection();

  expect(() =>
    withTransaction(connection.driver, () => {
      connection.driver.execute(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
        ['tx_keep', '1', '2026-03-14T00:00:00.000Z']
      );
      throw new Error('rollback');
    })
  ).toThrow('rollback');

  const keptRow = connection.driver.queryOne<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['tx_keep']
  );

  expect(keptRow).toBeUndefined();
});
