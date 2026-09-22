// @vitest-environment node
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));

import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { resetSeededWorkspace } from './databaseTestWorkspace.js';
import { recordPreparedImportFailure, runPreparedImport } from './importPipeline.js';
import { initializeDatabase } from './migrate.js';

const require = createRequire(import.meta.url);
let tempRoot = '';
let worker: Worker | undefined;
beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-import-contention-'));
  appDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  resetSeededWorkspace();
});
afterEach(async () => {
  await worker?.terminate();
  worker = undefined;
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

async function holdBackgroundWrite() {
  const barrier = new SharedArrayBuffer(4);
  worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const Database = require(workerData.modulePath);
    const sqlite = new Database(workerData.dbPath);
    sqlite.exec('BEGIN IMMEDIATE');
    parentPort.postMessage('locked');
    Atomics.wait(new Int32Array(workerData.barrier), 0, 0, 5000);
    setTimeout(() => { sqlite.exec('COMMIT'); sqlite.close(); }, 300);
  `, { eval: true, workerData: {
    barrier, dbPath: openDatabaseConnection().dbPath, modulePath: require.resolve('better-sqlite3')
  } });
  await new Promise<void>((resolve, reject) => {
    worker!.once('message', () => resolve());
    worker!.once('error', reject);
  });
  Atomics.store(new Int32Array(barrier), 0, 1);
  Atomics.notify(new Int32Array(barrier), 0);
}

function prepared() {
  return createPreparedDesktopTextImport({ content: '# Import\nSaved body', degradedReason: null,
    fileName: 'concurrent.md', filePath: '/fixture/concurrent.md', importedAt: '2026-09-22T10:00:00.000Z', kind: 'markdown' });
}

it('persists an import when a background connection already owns the SQLite writer', async () => {
  const input = prepared();
  await holdBackgroundWrite();
  const imported = runPreparedImport(input);
  expect(imported.resultStatus).toBe('imported');
  expect(imported.nodeId).toBeTruthy();
  expect(openDatabaseConnection().driver.queryOne('SELECT id FROM nodes WHERE id = ?', [imported.nodeId!]))
    .toEqual({ id: imported.nodeId });
});

it('records the original source failure while a background writer is active', async () => {
  const input = prepared();
  await holdBackgroundWrite();
  const failed = recordPreparedImportFailure(input, 'source_unavailable');
  expect(failed.failureReason).toBe('source_unavailable');
  expect(failed.nodeId).toBeNull();
  expect(openDatabaseConnection().driver.queryOne('SELECT failure_reason FROM import_runs WHERE id = ?', [failed.importId]))
    .toEqual({ failure_reason: 'source_unavailable' });
});
