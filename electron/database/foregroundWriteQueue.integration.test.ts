// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
let workerStarted: (() => void) | null = null;
let workerMessage: unknown;
vi.mock('node:worker_threads', async (importOriginal) => {
  const native = await importOriginal<typeof import('node:worker_threads')>();
  class SourceWorker extends native.Worker {
    constructor(_filename: string | URL, options?: import('node:worker_threads').WorkerOptions) {
      // Run the real production worker from source under the controlled Electron ABI.
      super(new URL('../ipc/searchIndexRebuildWorker.ts', import.meta.url), {
        ...options,
        execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types']
      });
      this.once('online', () => workerStarted?.());
      this.on('message', (message: unknown) => { workerMessage = message; });
    }
  }
  return { ...native, Worker: SourceWorker };
});
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
  })
}));
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  app: { getName: () => 'Foliole', getVersion: () => 'test', getPath: () => appDataDir },
  shell: {}, dialog: {}, ipcMain: {}, nativeImage: {}, clipboard: {}, Menu: {},
  systemPreferences: {}, screen: {}
}));
vi.mock('../ipc/assistantCommands.js', () => ({ handleAssistantCommand: vi.fn() }));
vi.mock('../ipc/importCommands.js', () => ({ handleImportCommand: vi.fn() }));
vi.mock('../ipc/reviewCommands.js', () => ({ handleReviewCommand: vi.fn() }));
vi.mock('../ipc/updateCommands.js', () => ({ handleDesktopUpdateCommand: vi.fn() }));
vi.mock('../ipc/windowCommands.js', () => ({ handleWindowAndUtilityCommand: vi.fn() }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));

import { processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';
import { workspaceSearchSourceStateMatches } from '../../lib/core/database/workspaceSearchSourceState.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';
import { handleInvokeRequest } from '../ipc/commands.js';
import { runWorkspaceSearchMaintenanceInWorker } from '../ipc/searchIndexRebuildWorkerClient.js';


import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { markDatabaseReady } from './databaseReadiness.js';
import { runDesktopDatabaseWrite } from './desktopDatabaseWriteQueue.js';
import { initializeDatabase } from './migrate.js';

const BetterSqlite3 = createRequire(import.meta.url)('better-sqlite3') as typeof import('better-sqlite3');
let root = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-t288-queue-'));
  appDataDir = path.join(root, 'app');
  initializeDatabase();
  markDatabaseReady();
  openDatabaseConnection().sqlite.pragma('busy_timeout = 0');
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  workerStarted = null;
});

function nodeArgs(nodeId: string, content: string) {
  const now = '2026-10-01T00:00:00.000Z';
  return {
    nodeId, content, parentNodeId: null, kind: 'topic', title: 'Foreground',
    isTitleManual: true, reveal: null, anchorLink: null,
    position: 0, createdAt: now, updatedAt: now, nodeOrder: []
  };
}

it('saves during real worker indexing and retains a newer dirty generation across reopen', async () => {
  await handleInvokeRequest({ command: 'create_topic', args: nodeArgs('t288-edit', 'Before') });
  const connection = openDatabaseConnection();
  const old = connection.driver.queryOne<{ id: number }>(
    'SELECT id FROM search_index_invalidations WHERE target_id = ?', ['t288-edit']
  );
  const searchWriter = new BetterSqlite3(connection.searchDbPath);
  searchWriter.exec('BEGIN IMMEDIATE');
  let online!: () => void;
  const ready = new Promise<void>((resolve) => { online = resolve; });
  workerStarted = online;
  let backgroundSettled = false;
  const indexing = runWorkspaceSearchMaintenanceInWorker(500).finally(() => { backgroundSettled = true; });
  void indexing.catch(() => undefined);
  try {
    await ready;
    await handleInvokeRequest({ command: 'update_node_content', args: nodeArgs('t288-edit', 'After') });
    expect(backgroundSettled).toBe(false);
    const newer = connection.driver.queryOne<{ id: number }>(
      'SELECT id FROM search_index_invalidations WHERE target_id = ?', ['t288-edit']
    );
    expect(newer?.id).toBeGreaterThan(old?.id ?? 0);
    searchWriter.exec('COMMIT');
    expect(await indexing, JSON.stringify(workerMessage)).toEqual({ failed: 0, processed: 1 });
    expect(connection.driver.queryOne('SELECT id FROM search_index_invalidations WHERE id = ?', [newer?.id ?? 0]))
      .toEqual(newer);
    closeDatabaseConnection();
    const reopened = openDatabaseConnection();
    expect(reopened.driver.queryOne(
      'SELECT CAST(c.data AS TEXT) AS body FROM nodes n JOIN content_blob_data c ON c.hash = n.body_blob_hash WHERE n.id = ?',
      ['t288-edit']
    )).toEqual({ body: 'After' });
    expect(await runWorkspaceSearchMaintenanceInWorker(500)).toEqual({ failed: 0, processed: 1 });
    expect(reopened.driver.queryOne('SELECT id FROM search_index_invalidations WHERE target_id = ?', ['t288-edit']))
      .toBeUndefined();
    expect(reopened.driver.queryOne("SELECT content FROM search.node_search WHERE node_id = ?", ['t288-edit']))
      .toEqual({ content: 'After' });
  } finally {
    if (searchWriter.inTransaction) searchWriter.exec('ROLLBACK');
    await indexing.catch(() => undefined);
    searchWriter.close();
  }
});

it('runs waiting foreground creation before the next background write', async () => {
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const active = desktopTaskScheduler.submit({
    id: 't288-active-batch', concurrencyKey: 't288-active-batch', label: 'Active batch',
    priority: 'background', source: 'test', resources: [{ resource: 'main-database-write' }],
    run: async () => { started(); await gate; }
  });
  await ready;
  const order: string[] = [];
  const background = runDesktopDatabaseWrite('background', () => {
    order.push('background');
    processSearchIndexInvalidations(openDatabaseConnection().driver);
  });
  const foreground = handleInvokeRequest({ command: 'create_topic', args: nodeArgs('t288-priority', 'Priority body') })
    .then(() => { order.push('foreground'); });
  for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
  release();
  await Promise.all([active.promise, foreground, background]);
  expect(order).toEqual(['foreground', 'background']);
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT id FROM nodes WHERE id = ? AND current_version_id IS NOT NULL', ['t288-priority']
  )).toEqual({ id: 't288-priority' });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { force: true, recursive: true });
});

it('rebuilds missing indexes in a real worker and settles the matching persisted source', async () => {
  await handleInvokeRequest({ command: 'create_topic', args: nodeArgs('t288-rebuild', 'Rebuilt body') });
  openDatabaseConnection().sqlite.exec('DROP TABLE search.node_search');
  expect(await runWorkspaceSearchMaintenanceInWorker(500)).toEqual({ failed: 0, processed: 0 });
  const connection = openDatabaseConnection();
  expect(connection.driver.queryOne('SELECT content FROM search.node_search WHERE node_id = ?', ['t288-rebuild']))
    .toEqual({ content: 'Rebuilt body' });
  expect(workspaceSearchSourceStateMatches(connection.driver)).toBe(true);
});

it('retains interrupted work and resumes it after reopening the database', async () => {
  await handleInvokeRequest({ command: 'create_topic', args: nodeArgs('t288-resume', 'Recoverable body') });
  const controller = new AbortController();
  workerStarted = () => controller.abort();
  await expect(runWorkspaceSearchMaintenanceInWorker(500, controller.signal)).rejects.toThrow();
  expect(openDatabaseConnection().driver.queryOne(
    'SELECT target_id FROM search_index_invalidations WHERE target_id = ?', ['t288-resume']
  )).toEqual({ target_id: 't288-resume' });
  workerStarted = null;
  closeDatabaseConnection();
  expect(await runWorkspaceSearchMaintenanceInWorker(500)).toEqual({ failed: 0, processed: 1 });
  expect(openDatabaseConnection().driver.queryOne('SELECT content FROM search.node_search WHERE node_id = ?', ['t288-resume']))
    .toEqual({ content: 'Recoverable body' });
});

it('lets an active background commit finish before foreground creation without losing either write', async () => {
  const connection = openDatabaseConnection();
  const writer = new BetterSqlite3(connection.dbPath);
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const background = desktopTaskScheduler.submit({
    id: 't288-background-write', concurrencyKey: 't288-background-write', label: 'Background write',
    priority: 'background', source: 'test', resources: [{ resource: 'main-database-write' }],
    run: async () => {
      writer.exec('BEGIN IMMEDIATE');
      writer.prepare('UPDATE settings SET updated_at = ? WHERE key = ?').run('t288-background', 'host_name');
      started();
      await gate;
      writer.exec('COMMIT');
    }
  });
  await ready;
  const now = '2026-10-01T00:00:00.000Z';
  const foreground = handleInvokeRequest({ command: 'create_topic', args: {
    nodeId: 't288-foreground', parentNodeId: null, kind: 'topic', title: 'Foreground',
    isTitleManual: true, content: 'Foreground body', reveal: null, anchorLink: null,
    position: 0, createdAt: now, updatedAt: now, nodeOrder: []
  }});
  // Observe rejection immediately so the intentional old-behavior failure is handled.
  const outcome = foreground.then((value) => ({ value }), (error: unknown) => ({ error }));
  try {
    for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
    release();
    await background.promise;
    const result = await outcome;
    expect(result).not.toHaveProperty('error');
    expect(connection.driver.queryOne('SELECT id FROM nodes WHERE id = ?', ['t288-foreground']))
      .toEqual({ id: 't288-foreground' });
    expect(connection.driver.queryOne('SELECT updated_at FROM settings WHERE key = ?', ['host_name']))
      .toEqual({ updated_at: 't288-background' });
  } finally {
    release();
    await background.promise;
    writer.close();
  }
});
