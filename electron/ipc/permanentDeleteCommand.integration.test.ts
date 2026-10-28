// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
const releasedHashes = vi.hoisted(() => [] as string[]);
vi.mock('node:worker_threads', async (importOriginal) => {
  const native = await importOriginal<typeof import('node:worker_threads')>();
  class SourceWorker extends native.Worker {
    constructor(_filename: string | URL, options?: import('node:worker_threads').WorkerOptions) {
      // Run the real production worker from source under the controlled Electron ABI.
      super(new URL('../database/releasedBodyCollectionWorker.ts', import.meta.url), {
        ...options,
        execArgv: ['--experimental-loader', './scripts/android/ts-js-extension-loader.mjs', '--experimental-strip-types']
      });
    }
  }
  return { ...native, Worker: SourceWorker };
});
vi.mock('./paths.js', () => ({
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
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../database/releasedBodyCollectionTask.js', () => ({
  enqueueReleasedBodyCollection: (hashes: string[]) => { releasedHashes.push(...hashes); }
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';
import { markDatabaseReady } from '../database/databaseReadiness.js';
import { initializeDatabase } from '../database/migrate.js';
import { restoreNodes, softDeleteNodes } from '../database/nodeMutations.js';
import { runReleasedBodyCollectionWorker } from '../database/releasedBodyCollectionWorkerClient.js';
import { resetSearchInvalidationCoalescerForTests } from '../database/searchIndexInvalidationCoalescer.js';

import { handleInvokeRequest } from './commands.js';

const NOW = '2026-10-23T00:00:00.000Z';
let root = '';

beforeEach(async () => {
  resetSearchInvalidationCoalescerForTests();
  releasedHashes.length = 0;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-t404-permanent-delete-'));
  appDataDir = path.join(root, 'app');
  initializeDatabase();
  markDatabaseReady();
});

afterEach(async () => {
  resetSearchInvalidationCoalescerForTests();
  closeDatabaseConnection();
  await fs.rm(root, { force: true, recursive: true, maxRetries: 5, retryDelay: 100 });
});

function nodeArgs(nodeId: string, parentNodeId: string | null, kind: 'folder' | 'topic', content: string) {
  return {
    nodeId, content, parentNodeId, kind, title: nodeId, isTitleManual: true, reveal: null, anchorLink: null,
    position: 0, createdAt: NOW, updatedAt: NOW, nodeOrder: []
  };
}

async function seedTrashedFolder(childCount: number) {
  await handleInvokeRequest({ command: 'create_folder', args: nodeArgs('trashed-folder', null, 'folder', '') });
  const childIds = Array.from({ length: childCount }, (_, index) => `trashed-topic-${index}`);
  for (const [index, childId] of childIds.entries()) {
    await handleInvokeRequest({
      command: 'create_topic', args: nodeArgs(childId, 'trashed-folder', 'topic', `Deleted body ${index}`)
    });
  }
  const nodeIds = ['trashed-folder', ...childIds];
  // Seeds the trash directly so the test only exercises the permanent delete route.
  softDeleteNodes({ nodeIds, deletedAt: NOW });
  return nodeIds;
}

function countRows(sql: string, params: string[]) {
  return openDatabaseConnection().driver.queryOne<{ count: number }>(sql, params)?.count ?? 0;
}

it('lets other writes run while a large trash is deleted and keeps the final state complete', async () => {
  const nodeIds = await seedTrashedFolder(24);
  const finished: string[] = [];
  const deletion = handleInvokeRequest({
    command: 'delete_nodes_permanently', args: { nodeIds }
  }).then((result) => { finished.push('delete'); return result; });
  const edit = handleInvokeRequest({
    command: 'create_topic', args: nodeArgs('kept-topic', null, 'topic', 'Deleted body 3')
  }).then(() => { finished.push('edit'); });

  await expect(deletion).resolves.toEqual({ removedNodeIds: nodeIds });
  await edit;
  expect(finished).toEqual(['edit', 'delete']);
  const placeholders = nodeIds.map(() => '?').join(', ');
  expect(countRows(`SELECT COUNT(*) AS count FROM nodes WHERE id IN (${placeholders})`, nodeIds)).toBe(0);
  expect(countRows(`SELECT COUNT(*) AS count FROM node_sync_tombstones WHERE node_id IN (${placeholders})`, nodeIds))
    .toBe(nodeIds.length);
  expect(countRows('SELECT COUNT(*) AS count FROM nodes WHERE id = ?', ['kept-topic'])).toBe(1);
});

it('collects released bodies in the background worker without touching bodies still held', async () => {
  const nodeIds = await seedTrashedFolder(0);
  restoreNodes({ nodeIds });
  await handleInvokeRequest({ command: 'create_topic', args: nodeArgs('edited-topic', 'trashed-folder', 'topic', 'Old body') });
  await handleInvokeRequest({ command: 'update_node_content', args: nodeArgs('edited-topic', 'trashed-folder', 'topic', 'Shared body') });
  await handleInvokeRequest({ command: 'create_topic', args: nodeArgs('kept-topic', null, 'topic', 'Shared body') });
  const { driver, dbPath } = openDatabaseConnection();
  const oldBody = upsertTextBodyBlob(driver, 'Old body', NOW);
  const sharedBody = upsertTextBodyBlob(driver, 'Shared body', NOW);
  const deletedIds = [...nodeIds, 'edited-topic'];
  softDeleteNodes({ nodeIds: deletedIds, deletedAt: NOW });
  await handleInvokeRequest({ command: 'delete_nodes_permanently', args: { nodeIds: deletedIds } });
  expect(releasedHashes).toContain(oldBody);
  expect(countRows('SELECT COUNT(*) AS count FROM content_blob_data WHERE hash = ?', [oldBody])).toBe(1);

  const result = await runReleasedBodyCollectionWorker(dbPath, [...new Set(releasedHashes)], new AbortController().signal);

  expect(result.deletedHashes).toContain(oldBody);
  expect(result.deletedHashes).not.toContain(sharedBody);
  expect(countRows('SELECT COUNT(*) AS count FROM content_blob_data WHERE hash = ?', [oldBody])).toBe(0);
  expect(countRows('SELECT COUNT(*) AS count FROM content_blob_data WHERE hash = ?', [sharedBody])).toBe(1);
});


it('deletes from IDs alone while preserving unrelated ordering and learning after reopen', async () => {
  const nodeIds = await seedTrashedFolder(1);
  for (const id of ['kept-folder', 'first', 'second']) {
    await handleInvokeRequest({ command: 'create_topic', args: nodeArgs(id, id === 'kept-folder' ? null : 'kept-folder', 'topic', id) });
  }
  const { driver } = openDatabaseConnection();
  const { rewriteParentChildOrder } = await import('../../lib/core/database/nodeOrderMutations.js');
  rewriteParentChildOrder(driver, 'kept-folder', ['second', 'first']);
  driver.execute("INSERT INTO node_reading (node_id, last_handled_at, next_at) VALUES ('first', 'handled', 'next')");
  const orders = () => openDatabaseConnection().driver.queryAll(
    "SELECT * FROM parent_child_order WHERE parent_id = 'kept-folder'");
  const learning = () => openDatabaseConnection().driver.queryAll('SELECT * FROM node_reading');
  const beforeOrder = orders();
  const beforeLearning = learning();

  await expect(handleInvokeRequest({ command: 'delete_nodes_permanently', args: { nodeIds } }))
    .resolves.toEqual({ removedNodeIds: nodeIds });

  closeDatabaseConnection();
  expect(orders()).toEqual(beforeOrder);
  expect(learning()).toEqual(beforeLearning);
  expect(countRows('SELECT COUNT(*) AS count FROM nodes WHERE id = ?', [nodeIds[0]!])).toBe(0);
  expect(countRows('SELECT COUNT(*) AS count FROM node_sync_tombstones WHERE node_id = ?', [nodeIds[0]!])).toBe(1);
});

it('retains sibling order, hidden slots and source order facts when one child is removed', async () => {
  for (const id of ['parent', 'first', 'hidden', 'removed', 'last']) {
    await handleInvokeRequest({ command: 'create_topic', args: nodeArgs(id, id === 'parent' ? null : 'parent', 'topic', id) });
  }
  const { driver } = openDatabaseConnection();
  const { rewriteParentChildOrder } = await import('../../lib/core/database/nodeOrderMutations.js');
  const { loadDerivedNodeOrder } = await import('../../lib/core/database/parentChildOrder.js');
  rewriteParentChildOrder(driver, 'parent', ['last', 'hidden', 'removed', 'first']);
  softDeleteNodes({ nodeIds: ['hidden', 'removed'], deletedAt: NOW });
  loadDerivedNodeOrder(driver);
  const sources = () => openDatabaseConnection().driver.queryAll('SELECT * FROM parent_order_sources ORDER BY parent_id, author_id');
  const beforeSources = sources();

  await handleInvokeRequest({ command: 'delete_nodes_permanently', args: { nodeIds: ['removed'] } });

  closeDatabaseConnection();
  const reopened = openDatabaseConnection().driver;
  expect(loadDerivedNodeOrder(reopened).filter((id) => ['last', 'hidden', 'removed', 'first'].includes(id)))
    .toEqual(['last', 'hidden', 'first']);
  expect(reopened.queryOne("SELECT deleted_at FROM nodes WHERE id = 'hidden'")).toEqual({ deleted_at: NOW });
  expect(sources()).toEqual(beforeSources);
});
