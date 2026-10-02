// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appData = '';
let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({ app_data_dir: appData,
  app_cache_dir: path.join(appData, 'cache'), app_config_dir: path.join(appData, 'config'),
  app_log_dir: path.join(appData, 'logs'), documents_dir: appData }) }));
vi.mock('node:worker_threads', async (original) => {
  const native = await original<typeof import('node:worker_threads')>();
  return { ...native, Worker: class extends native.Worker {
    constructor(_url: URL, options: import('node:worker_threads').WorkerOptions) {
      super(new URL('./legacyBodyCollectionWorker.ts', import.meta.url), { ...options,
        execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types'] });
    }
  } };
});
import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { readDataMigrationState } from '../../lib/core/database/dataMigrationState.js';

import { restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { BODY_COLLECTION_ID, BODY_RECLAIM_ID, initialBodyMigrationProgress, saveBodyMigrationProgress } from './legacyBodyMigrationState.js';
import { initializeDatabase } from './migrate.js';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-body-restore-'));
  appData = path.join(root, 'app');
  initializeDatabase();
});
afterEach(async () => { closeExternalSearchCacheDatabase(); closeDatabaseConnection(); await fs.rm(root, { recursive: true, force: true }); });

it.each([false, true])('restores and collects without restarting the app, with prior legacy completion=%s', async (completed) => {
  const connection = openDatabaseConnection();
  const garbage = upsertTextBodyBlob(connection.driver, '12', '2026-01-01');
  connection.sqlite.prepare('DELETE FROM data_migration_state WHERE migration_id=?').run(BODY_RECLAIM_ID);
  connection.sqlite.prepare('DELETE FROM legacy_body_migration_progress WHERE migration_id=?').run(BODY_RECLAIM_ID);
  if (!completed) {
    connection.sqlite.prepare('DELETE FROM data_migration_state WHERE migration_id=?').run(BODY_COLLECTION_ID);
    connection.sqlite.prepare('DELETE FROM legacy_body_migration_progress WHERE migration_id=?').run(BODY_COLLECTION_ID);
  }
  saveBodyMigrationProgress(connection, initialBodyMigrationProgress('released-body-collection-v2', 'done'), true);
  connection.sqlite.prepare(`INSERT INTO sync_pack_dependency_rows VALUES
    ('group','peer','view','node','object',0,'nodes','{}',?,'digest')`)
    .run(JSON.stringify({ list: Array.from({ length: 13 }, () => null) }));
  const backup = path.join(root, 'old.db');
  await connection.sqlite.backup(backup);
  await restoreApplicationDatabaseBackup({ sourcePath: backup });
  await vi.waitFor(() => {
    expect(readDataMigrationState(openDatabaseConnection().sqlite, BODY_RECLAIM_ID)?.status).toBe('completed');
  }, { timeout: 2500 });
  expect(openDatabaseConnection().sqlite.prepare('SELECT hash FROM content_blobs WHERE hash=?').get(garbage)).toBeUndefined();
  expect(readDataMigrationState(openDatabaseConnection().sqlite, BODY_COLLECTION_ID)?.status).toBe('completed');
});
