// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-trash-sync-version-drain';

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(() => null), getFocusedWindow: vi.fn(() => null) },
  app: { getVersion: () => '1.0.0' },
  shell: { openExternal: vi.fn().mockResolvedValue(undefined) }
}));
vi.mock('./paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../database/databaseReadiness.js', () => ({ waitForDatabaseReady: vi.fn() }));
vi.mock('./menu.js', () => ({ syncAppMenuState: vi.fn() }));
vi.mock('./boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined), bootReport: vi.fn() }));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import { closeDatabaseConnection, openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';
import { initializeDatabase } from '../database/migrate.js';
import { seedNode } from '../database/nodeMutations.test.helpers.js';
import { drainDirtyNodeSyncVersions } from '../database/nodeSyncVersionDrain.js';
import { createDesktopRequestSyncDatabaseHost } from '../sync/desktopRequestSyncDatabaseHost.js';

import { handleInvokeRequest } from './commands.js';

const NODE_COUNT = 160;
const childIds = Array.from({ length: NODE_COUNT - 1 }, (_, index) => `child-${index}`);
const nodeIds = ['root', ...childIds];
const deletedAt = '2026-10-23T12:00:00.000Z';
let tempRoot = '';
let observer: Database.Database;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-trash-sync-drain-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  seedNode('root', null, 0);
  childIds.forEach((nodeId, index) => seedNode(nodeId, 'root', index));
  await drainDirtyNodeSyncVersions();
  observer = new Database(openDatabaseConnection().dbPath, { readonly: true });
});

afterEach(async () => {
  observer.close();
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function pendingCount() {
  const placeholders = nodeIds.map(() => '?').join(', ');
  return (observer.prepare(`SELECT count(*) AS count FROM nodes
    WHERE id IN (${placeholders}) AND sync_dirty = 1`).get(...nodeIds) as { count: number }).count;
}

/** Records the pending-version count another reader sees on every event loop turn. */
async function observePending<T>(run: () => Promise<T>) {
  const seen = new Set<number>();
  let active = true;
  const tick = () => {
    if (!active) return;
    seen.add(pendingCount());
    setImmediate(tick);
  };
  setImmediate(tick);
  try {
    return { result: await run(), seen };
  } finally {
    active = false;
  }
}

function versionedDeletedAt() {
  return runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.queryAll<{ id: string; deleted: string | null; dirty: number }>(
    `SELECT n.id, json_extract(v.snapshot_json, '$.deleted_at') AS deleted, n.sync_dirty AS dirty
     FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id
     WHERE n.id IN (SELECT value FROM json_each(?)) ORDER BY n.id`, [JSON.stringify(nodeIds)]));
}

function invoke(command: string, args: Record<string, unknown>) {
  return handleInvokeRequest({ command, args } as Parameters<typeof handleInvokeRequest>[0]);
}

it('commits a Trash move at once and versions the subtree in batches the window can interleave', async () => {
  const { seen } = await observePending(async () => {
    await invoke(NATIVE_COMMANDS.softDeleteNodes, { deletedAt, nodeIds });
    expect((observer.prepare('SELECT count(*) AS count FROM nodes WHERE deleted_at = ?').get(deletedAt) as { count: number }).count)
      .toBe(NODE_COUNT);
    await drainDirtyNodeSyncVersions();
  });

  expect([...seen].some((count) => count > 0 && count < NODE_COUNT)).toBe(true);
  expect(await versionedDeletedAt()).toEqual(expect.arrayContaining(
    nodeIds.map((id) => ({ id, deleted: deletedAt, dirty: 0 }))));
});

it('versions pending nodes for an editor flush in batches and reports every node', async () => {
  await runWithDatabaseConnectionOwner(() => openDatabaseConnection().driver.execute(
    'UPDATE nodes SET sync_dirty = 1 WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(nodeIds)]));

  const { result, seen } = await observePending(() => invoke(NATIVE_COMMANDS.flushDirtyNodeSyncVersions, {}));

  expect([...seen].some((count) => count > 0 && count < NODE_COUNT)).toBe(true);
  expect(result).toEqual(expect.arrayContaining(nodeIds));
  expect(pendingCount()).toBe(0);
});

it('keeps an undo made before the background versions finish', async () => {
  await invoke(NATIVE_COMMANDS.softDeleteNodes, { deletedAt, nodeIds });
  await invoke(NATIVE_COMMANDS.restoreNodes, { nodeIds });
  await drainDirtyNodeSyncVersions();

  expect(await versionedDeletedAt()).toEqual(expect.arrayContaining(
    nodeIds.map((id) => ({ id, deleted: null, dirty: 0 }))));
});

it('lets a sync round that starts right after a Trash move see every deletion', async () => {
  await invoke(NATIVE_COMMANDS.softDeleteNodes, { deletedAt, nodeIds });
  const host = createDesktopRequestSyncDatabaseHost(openDatabaseConnection().dbPath);

  await host.write(async () => undefined);

  expect(pendingCount()).toBe(0);
  expect(await versionedDeletedAt()).toEqual(expect.arrayContaining(
    nodeIds.map((id) => ({ id, deleted: deletedAt, dirty: 0 }))));
});
