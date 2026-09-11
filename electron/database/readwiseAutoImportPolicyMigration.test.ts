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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

const guards = [
  'readwise_host_settings_insert_guard',
  'readwise_host_settings_update_guard',
  'readwise_host_setting_record_insert_guard',
  'readwise_host_setting_record_update_guard'
];
let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-policy-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function prepareV83() {
  const connection = openDatabaseConnection();
  guards.forEach((name) => connection.sqlite.exec(`DROP TRIGGER IF EXISTS ${name}`));
  const global = JSON.stringify({ detailsOpen: false, sources: [], version: 4 });
  const host = JSON.stringify({
    readwiseReaderConfig: {
      enabled: true,
      withHighlightsDestination: 'external',
      withoutHighlightsDestination: 'inbox'
    },
    readwiseRootPath: '/Readwise',
    version: 2
  });
  connection.driver.execute(`INSERT INTO settings (key, value, updated_at) VALUES
    ('import_manager_settings', ?, '2026-09-01T00:00:00.000Z'),
    ('readwise_import_settings', ?, '2026-09-01T00:00:00.000Z')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [global, host]);
  connection.driver.execute(`INSERT INTO setting_records
    (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at) VALUES
    ('import_manager_settings', 'user', '', '', '', ?, 'old-global', '2026-09-01T00:00:00.000Z'),
    ('readwise_import_settings', 'host', 'darwin', 'desktop', 'This Mac', ?, 'old-host', '2026-09-01T00:00:00.000Z')
    ON CONFLICT(key, scope, platform, form_factor, host_name) DO UPDATE SET
      value_json = excluded.value_json, content_hash = excluded.content_hash,
      updated_at = excluded.updated_at`, [global, host]);
  connection.sqlite.pragma('user_version = 83');
  return { connection, global, host };
}

it('atomically migrates the legacy article grid to seven categories', () => {
  const { connection } = prepareV83();
  initializeDatabaseSchema(connection.sqlite);

  const global = JSON.parse(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'import_manager_settings'"
  )!.value) as Record<string, unknown>;
  const host = JSON.parse(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'readwise_import_settings'"
  )!.value) as Record<string, unknown>;
  expect(global.readwiseAutoImportPolicy).toEqual({
    articleWithHighlights: 'external',
    articleWithoutHighlights: 'inbox',
    emailWithHighlights: 'inbox', emailWithoutHighlights: 'off',
    epubWithHighlights: 'inbox', epubWithoutHighlights: 'inbox',
    pdfWithHighlights: 'inbox', pdfWithoutHighlights: 'inbox',
    rssWithHighlights: 'inbox', rssWithoutHighlights: 'off',
    tweetWithHighlights: 'inbox', tweetWithoutHighlights: 'off',
    importTag: '',
    version: 3,
    videoWithHighlights: 'inbox', videoWithoutHighlights: 'off'
  });
  expect(global).not.toHaveProperty('readwiseReaderConfig');
  expect(host).toMatchObject({ autoImportPolicyVersion: 3, version: 5 });
  expect(host.readwiseReaderConfig).not.toHaveProperty('withHighlightsDestination');
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(86);
  expect(connection.driver.queryAll<{ sync_dirty: number }>(
    "SELECT sync_dirty FROM sync_object_state WHERE object_type = 'setting'"
  ).every((row) => row.sync_dirty === 1)).toBe(true);
  expect(() => connection.driver.execute(
    "UPDATE settings SET value = '{\"version\":4}' WHERE key = 'readwise_import_settings'"
  )).toThrow('readwise_host_settings_version_unsupported');
});

it('rolls the settings and schema version back when the migration transaction fails', () => {
  const { connection, global, host } = prepareV83();
  expect(() => initializeDatabaseSchema(connection.sqlite, {
    beforeVersionCommit: () => { throw new Error('injected policy migration failure'); }
  })).toThrow('injected policy migration failure');

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(83);
  expect(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'import_manager_settings'"
  )?.value).toBe(global);
  expect(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'readwise_import_settings'"
  )?.value).toBe(host);
});
