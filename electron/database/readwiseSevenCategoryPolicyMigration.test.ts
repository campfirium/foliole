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

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-seven-policy-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function prepareV84(status: 'api' | 'migration-in-progress') {
  const connection = openDatabaseConnection();
  for (const name of [
    'readwise_host_settings_insert_guard',
    'readwise_host_settings_update_guard',
    'readwise_host_setting_record_insert_guard',
    'readwise_host_setting_record_update_guard'
  ]) connection.sqlite.exec(`DROP TRIGGER IF EXISTS ${name}`);
  connection.sqlite.pragma('user_version = 84');
  const settings = JSON.stringify({
    readwiseAutoImportPolicy: {
      articleWithHighlights: 'external', articleWithoutHighlights: 'off',
      bookWithHighlights: 'off', bookWithoutHighlights: 'external', version: 1
    }, version: 5
  });
  const host = JSON.stringify({ autoImportPolicyVersion: 1, version: 3 });
  const journal = JSON.stringify({
    annotations: [], cohortDocumentIds: ['document'], completedAt: 'now',
    documents: [], retiredNodeIds: [], sourceHost: 'This Mac', startedAt: 'then', status, version: 2
  });
  connection.driver.execute(`INSERT INTO settings (key, value, updated_at)
    VALUES ('import_manager_settings', ?, 'now')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [settings]);
  connection.driver.execute(`INSERT INTO settings (key, value, updated_at)
    VALUES ('readwise_import_settings', ?, 'now')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [host]);
  connection.driver.execute(`INSERT INTO settings (key, value, updated_at)
    VALUES ('readwise_source_cutover_v2', ?, 'now')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [journal]);
  connection.driver.execute(`INSERT INTO readwise_api_import_stage
    (connection_ref, record_kind, remote_id, payload_json)
    VALUES ('connection', 'candidate-v2', 'document', '{}')`);
  connection.driver.execute(`INSERT INTO readwise_api_import_runs
    (connection_ref, query_updated_after, round_started_at, phase, updated_at)
    VALUES ('connection', NULL, 'then', 'candidate-v2:ready', 'now')`);
  return { connection, journal };
}

it('switches policy and Host gate before retiring only terminal candidate staging', () => {
  const { connection, journal } = prepareV84('api');
  initializeDatabaseSchema(connection.sqlite);

  const global = JSON.parse(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'import_manager_settings'"
  )!.value) as Record<string, unknown>;
  const host = JSON.parse(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'readwise_import_settings'"
  )!.value) as Record<string, unknown>;
  expect(global.readwiseAutoImportPolicy).toMatchObject({
    articleWithHighlights: 'external', articleWithoutHighlights: 'off',
    emailWithHighlights: 'inbox', emailWithoutHighlights: 'off',
    epubWithHighlights: 'off', epubWithoutHighlights: 'external',
    importTag: '', pdfWithHighlights: 'inbox', pdfWithoutHighlights: 'inbox', version: 3
  });
  expect(host).toMatchObject({ autoImportPolicyVersion: 3, version: 5 });
  expect(connection.driver.queryOne('SELECT 1 FROM readwise_api_import_stage')).toBeUndefined();
  expect(connection.driver.queryOne('SELECT 1 FROM readwise_api_import_runs')).toBeUndefined();
  expect(connection.driver.queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'readwise_source_cutover_v2'"
  )?.value).toBe(journal);
});

it('preserves candidate staging while cutover is not terminal', () => {
  const { connection } = prepareV84('migration-in-progress');
  initializeDatabaseSchema(connection.sqlite);

  expect(connection.driver.queryOne('SELECT 1 FROM readwise_api_import_stage')).toBeTruthy();
  expect(connection.driver.queryOne('SELECT 1 FROM readwise_api_import_runs')).toBeTruthy();
});
