// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';
import { createDefaultReadwiseAutoImportPolicy } from '../../lib/core/import/readwiseAutoImportPolicy.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-tag-policy-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('adds an empty import tag and advances the Host gate atomically from v85', () => {
  const connection = openDatabaseConnection();
  for (const name of [
    'readwise_host_settings_insert_guard',
    'readwise_host_settings_update_guard',
    'readwise_host_setting_record_insert_guard',
    'readwise_host_setting_record_update_guard'
  ]) connection.sqlite.exec(`DROP TRIGGER IF EXISTS ${name}`);
  connection.sqlite.pragma('user_version = 85');
  const global = JSON.stringify({
    readwiseAutoImportPolicy: { ...createDefaultReadwiseAutoImportPolicy(), importTag: undefined, version: 2 },
    version: 5
  });
  const host = JSON.stringify({ autoImportPolicyVersion: 2, version: 4 });
  connection.driver.execute(`INSERT INTO settings (key, value, updated_at) VALUES
    ('import_manager_settings', ?, 'now'), ('readwise_import_settings', ?, 'now')`, [global, host]);

  initializeDatabaseSchema(connection.sqlite);

  const policy = JSON.parse(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'import_manager_settings'"
  )!.value).readwiseAutoImportPolicy as Record<string, unknown>;
  const migratedHost = JSON.parse(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'readwise_import_settings'"
  )!.value) as Record<string, unknown>;
  expect(policy).toMatchObject({ importTag: '', version: 3 });
  expect(migratedHost).toMatchObject({ autoImportPolicyVersion: 3, version: 5 });
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(86);
  expect(() => connection.driver.execute(
    "UPDATE settings SET value = '{\"version\":4}' WHERE key = 'readwise_import_settings'"
  )).toThrow('readwise_host_settings_version_unsupported');
});
