// @vitest-environment node
import { promises as fs, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appRoot = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(appRoot, 'app'), app_cache_dir: path.join(appRoot, 'cache'),
  app_config_dir: path.join(appRoot, 'config'), app_log_dir: path.join(appRoot, 'logs'),
  documents_dir: path.join(appRoot, 'Documents')
}) }));
vi.mock('node:worker_threads', async (original) => {
  const native = await original<typeof import('node:worker_threads')>();
  return { ...native, Worker: class extends native.Worker {
    constructor(url: URL, options: import('node:worker_threads').WorkerOptions) {
      super(new URL(url.href.replace(/\.js$/u, '.ts')), { ...options,
        execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-transform-types'] });
    }
  } };
});

import { DATABASE_SCHEMA_VERSION } from '../../lib/core/database/migrations.js';
import { readWorkspaceSearchSidecarRebuildStatus } from '../../lib/core/database/workspaceSearchSidecar.js';
import type { NativeDatabaseUpgradeStatus } from '../../lib/platform/nativeDatabaseUpgradeContract.js';

import { restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { beginDatabaseStartup, markDatabaseReady } from './databaseReadiness.js';
import { loadDatabaseUpgradeStatus } from './databaseUpgradeStatus.js';
import { historicalTextbookLibrary } from './historicalTextbookLibrary.testSupport.js';
import { waitForManagedSafetySnapshotSettlements } from './managedSafetySnapshots.js';
import { initializeDatabase } from './migrate.js';
import * as searchAliasMirror from './searchAliasMirror.js';
import { upgradeLibraryBeforeStartup } from './startupLibraryUpgrade.js';

beforeEach(async () => { appRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-background-upgrade-')); });
afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  markDatabaseReady();
  await fs.rm(appRoot, { recursive: true, force: true });
});

function installOlderLibrary() {
  const dbPath = initializeDatabase().dbPath;
  closeDatabaseConnection();
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });
  const older = historicalTextbookLibrary(240, 3, 20);
  writeFileSync(dbPath, older.serialize());
  older.close();
  return dbPath;
}

/** A responsive window on a slow hosted runner; a main-thread upgrade or copy stalls for seconds. */
const MAX_MAIN_THREAD_STALL_MS = 500;

function watchMainThread() {
  const statuses: NativeDatabaseUpgradeStatus[] = [];
  let longestStallMs = 0;
  let last = performance.now();
  const probe = setInterval(() => {
    const now = performance.now();
    longestStallMs = Math.max(longestStallMs, now - last);
    last = now;
    statuses.push(loadDatabaseUpgradeStatus());
  }, 10);
  return { stop: () => { clearInterval(probe); return { longestStallMs, statuses }; } };
}

it('opens a library from an older version without stalling the main thread', async () => {
  const dbPath = installOlderLibrary();
  beginDatabaseStartup();
  const watch = watchMainThread();
  const stages: string[] = [];
  const stagePayloads: unknown[] = [];
  await upgradeLibraryBeforeStartup((stage, payload) => { stages.push(stage); stagePayloads.push(payload); });
  const { longestStallMs, statuses } = watch.stop();
  const connection = initializeDatabase();
  markDatabaseReady();
  await waitForManagedSafetySnapshotSettlements();

  expect(connection.dbPath).toBe(dbPath);
  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(openDatabaseConnection().sqlite.prepare('SELECT count(*) AS n FROM node_sync_versions WHERE body_text IS NULL').get())
    .toEqual({ n: 480 });
  expect(statuses.some((status) => status.state === 'upgrading')).toBe(true);
  expect(loadDatabaseUpgradeStatus()).toEqual({ state: 'ready' });
  expect(stages).toEqual(['database_background_upgrade_complete']);
  expect(stagePayloads[0]).toMatchObject({ result: 'upgraded' });
  // Upgrading this library on the main thread blocked it for the whole migration (minutes for a large library).
  expect(longestStallMs).toBeLessThan(MAX_MAIN_THREAD_STALL_MS);
}, 120_000);

it('restores a backup from an older version without stalling the main thread', async () => {
  vi.spyOn(searchAliasMirror, 'startSearchAliasMirror').mockResolvedValue(undefined);
  initializeDatabase();
  const backupPath = path.join(appRoot, 'older-backup.db');
  const older = historicalTextbookLibrary(480, 3, 20);
  writeFileSync(backupPath, older.serialize());
  older.close();
  const watch = watchMainThread();
  await restoreApplicationDatabaseBackup({ sourcePath: backupPath });
  const { longestStallMs, statuses } = watch.stop();
  const restored = openDatabaseConnection().sqlite;
  expect(restored.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(restored.prepare('SELECT count(*) AS n FROM node_sync_versions WHERE body_text IS NULL').get()).toEqual({ n: 960 });
  expect(statuses.some((status) => status.state === 'upgrading')).toBe(true);
  // The restored library is searchable as soon as the restore completes.
  expect(readWorkspaceSearchSidecarRebuildStatus(restored)?.status).toBe('ready');
  expect(restored.prepare("SELECT count(*) AS n FROM search.node_search WHERE node_id = 'topic-479'").get()).toEqual({ n: 1 });
  expect(longestStallMs).toBeLessThan(MAX_MAIN_THREAD_STALL_MS);
}, 120_000);
