// @vitest-environment node
import { promises as fs } from 'node:fs';
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
    constructor(_url: URL, options: import('node:worker_threads').WorkerOptions) {
      super(new URL('./legacyBodyCollectionWorker.ts', import.meta.url), { ...options,
        execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types'] });
    }
  } };
});

import { hashTextBody, upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { readDataMigrationState } from '../../lib/core/database/dataMigrationState.js';
import { upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { runLegacyBodyCollectionWorker } from './legacyBodyCollectionWorkerClient.js';
import { BODY_COLLECTION_ID } from './legacyBodyMigrationState.js';
import { initializeDatabase } from './migrate.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

beforeEach(async () => { appRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-body-startup-')); });
afterEach(async () => { closeDatabaseConnection(); await fs.rm(appRoot, { recursive: true, force: true }); });
const NOW = '2026-10-01T00:00:00Z';

it('preserves owned bodies and version facts on cold open and resumes explicit cache collection', async () => {
  const connection = initializeDatabase();
  expect(readDataMigrationState(connection.sqlite, BODY_COLLECTION_ID)?.status).toBe('completed');
  upsertNodeSnapshot(connection.driver, { nodeId: 'legacy', parentNodeId: null, kind: 'topic', title: 'Original',
    isTitleManual: true, content: 'Canonical body', reveal: null, anchorLink: null, position: null,
    createdAt: NOW, updatedAt: NOW, hostName: 'host' });
  const oldVersion = flushNodeSyncVersionWithDriver(connection.driver, 'legacy', 'host', NOW)!;
  connection.sqlite.prepare("UPDATE nodes SET content = 'Canonical body' WHERE id = 'legacy'").run();
  const garbage = upsertTextBodyBlob(connection.driver, 'Unused body', NOW);
  connection.sqlite.exec('DELETE FROM data_migration_state; DELETE FROM legacy_body_migration_progress');
  const dbPath = connection.dbPath;
  closeDatabaseConnection();
  initializeDatabase();
  expect(readDataMigrationState(openDatabaseConnection().sqlite, BODY_COLLECTION_ID)).toBeNull();
  expect(openDatabaseConnection().sqlite.prepare('SELECT body_text FROM node_sync_versions WHERE version_id = ?').pluck().get(oldVersion)).toBe('Canonical body');
  const repaired = openDatabaseConnection().sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'legacy'").pluck().get();
  expect(repaired).toBe(oldVersion);
  await runLegacyBodyCollectionWorker(dbPath, 1, new AbortController().signal);
  closeDatabaseConnection();
  initializeDatabase();
  let result = await runLegacyBodyCollectionWorker(dbPath, 1, new AbortController().signal);
  while (!result.completed) result = await runLegacyBodyCollectionWorker(dbPath, 1, new AbortController().signal);
  expect(openDatabaseConnection().sqlite.prepare('SELECT hash FROM content_blobs WHERE hash = ?').get(garbage)).toBeUndefined();
  expect(openDatabaseConnection().sqlite.prepare("SELECT content, body_blob_hash FROM nodes WHERE id = 'legacy'").get())
    .toEqual({ content: 'Canonical body', body_blob_hash: hashTextBody('Canonical body') });
  closeDatabaseConnection();
  initializeDatabase();
  expect(openDatabaseConnection().sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'legacy'").pluck().get()).toBe(repaired);
  expect(await runLegacyBodyCollectionWorker(dbPath, 1, new AbortController().signal)).toEqual({ completed: true, paused: false });
});

it('waits for worker exit on abort and leaves committed progress resumable', async () => {
  const connection = initializeDatabase();
  connection.sqlite.prepare('DELETE FROM data_migration_state WHERE migration_id = ?').run(BODY_COLLECTION_ID);
  connection.sqlite.prepare('DELETE FROM legacy_body_migration_progress WHERE migration_id = ?').run(BODY_COLLECTION_ID);
  const controller = new AbortController();
  const result = runLegacyBodyCollectionWorker(connection.dbPath, 1, controller.signal);
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(connection.sqlite.pragma('quick_check', { simple: true })).toBe('ok');
  expect(await runLegacyBodyCollectionWorker(connection.dbPath, 1, new AbortController().signal)).toMatchObject({ completed: true });
});
