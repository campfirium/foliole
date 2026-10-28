// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: appDataDir, app_cache_dir: path.join(appDataDir, 'cache'),
  app_config_dir: path.join(appDataDir, 'config'), app_log_dir: path.join(appDataDir, 'logs')
}) }));
vi.mock('../ipc/boot.js', () => ({ appendBootEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./releasedBodyCollectionTask.js', () => ({ enqueueReleasedBodyCollection: vi.fn() }));
vi.mock('../mirror/mirrorSyncScheduler.js', () => ({ scheduleMirrorSync: vi.fn() }));
vi.mock('../ipc/workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: vi.fn() }));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

import { processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { handleNodeMutationCommand } from '../ipc/storageNodeMutationCommands.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { getNodeRow, seedNode } from './nodeMutations.test.helpers.js';
import { drainDirtyNodeSyncVersions } from './nodeSyncVersionDrain.js';
import { searchWorkspace } from './workspaceSearch.js';

beforeEach(async () => {
  appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-cold-delete-'));
  initializeDatabase(undefined, { deferSearchIndex: true, recovery: 'fail' });
  seedNode('survivor', null, 0);
  seedNode('removed', null, 1);
});
afterEach(async () => {
  await drainDirtyNodeSyncVersions();
  closeDatabaseConnection();
  await fs.rm(appDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

function searchTables() {
  return openDatabaseConnection().driver.queryAll<{ name: string }>(
    "SELECT name FROM search.sqlite_master WHERE type = 'table' AND name IN ('node_search', 'pdf_search', 'pdf_page_map', 'search_metadata')"
  );
}
function expectDeleted() {
  expect(getNodeRow('removed')).toBeUndefined();
  expect(getNodeRow('survivor')?.content).toBe('# survivor');
  expect(openDatabaseConnection().driver.queryOne(
    "SELECT node_id FROM node_sync_tombstones WHERE node_id = 'removed'"
  )).toEqual({ node_id: 'removed' });
}

it('permanently deletes before search tables exist and rebuilds only surviving content after reopen', async () => {
  expect(searchTables()).toEqual([]);
  await handleNodeMutationCommand('delete_nodes_permanently', { nodeIds: ['removed'] });
  expectDeleted();
  expect(searchTables()).toEqual([]);
  closeDatabaseConnection();
  initializeDatabase(undefined, { deferSearchIndex: true, recovery: 'fail' });
  expectDeleted();
  initializeWorkspaceSearchSidecar(openDatabaseConnection());
  expect(searchWorkspace('removed')).toEqual([]);
  expect(searchWorkspace('survivor').map(({ id }) => id)).toEqual(['survivor']);
});

it('clears all pending work without creating search tables when every ordinary node is deleted', async () => {
  await handleNodeMutationCommand('delete_nodes_permanently', { nodeIds: ['removed', 'survivor'] });
  expect(getNodeRow('removed')).toBeUndefined();
  expect(getNodeRow('survivor')).toBeUndefined();
  expect(openDatabaseConnection().driver.queryAll('SELECT * FROM main.search_index_invalidations')).toEqual([]);
  expect(searchTables()).toEqual([]);
  closeDatabaseConnection();
  initializeDatabase(undefined, { recovery: 'fail' });
  expect(searchWorkspace('removed')).toEqual([]);
  expect(searchWorkspace('survivor')).toEqual([]);
});

it('immediately removes initialized search content and preserves the surviving result after reopen', async () => {
  initializeWorkspaceSearchSidecar(openDatabaseConnection());
  expect(searchWorkspace('removed').map(({ id }) => id)).toEqual(['removed']);
  await handleNodeMutationCommand('delete_nodes_permanently', { nodeIds: ['removed'] });
  expectDeleted();
  expect(searchWorkspace('removed')).toEqual([]);
  expect(processSearchIndexInvalidations(openDatabaseConnection().driver).failed).toBe(0);
  closeDatabaseConnection();
  initializeDatabase(undefined, { recovery: 'fail' });
  expectDeleted();
  expect(searchWorkspace('removed')).toEqual([]);
});

it('retains the pre-delete tombstone version when cold physical deletion aborts and can retry after reopen', async () => {
  const { driver } = openDatabaseConnection();
  driver.execute("CREATE TRIGGER reject_cold_delete BEFORE DELETE ON nodes WHEN OLD.id = 'removed' BEGIN SELECT RAISE(ABORT, 'physical delete failed'); END");
  await expect(handleNodeMutationCommand('delete_nodes_permanently', { nodeIds: ['removed'] }))
    .rejects.toThrow('physical delete failed');
  expect(getNodeRow('removed')?.deleted_at).toBeTruthy();
  expect(driver.queryOne<{ snapshot_json: string }>(
    "SELECT snapshot_json FROM node_sync_versions WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = 'removed')"
  )?.snapshot_json).toContain('deleted_at');
  closeDatabaseConnection();
  initializeDatabase(undefined, { deferSearchIndex: true, recovery: 'fail' });
  openDatabaseConnection().driver.execute('DROP TRIGGER reject_cold_delete');
  await handleNodeMutationCommand('delete_nodes_permanently', { nodeIds: ['removed'] });
  expectDeleted();
});

it.each(['node_search', 'pdf_search', 'pdf_page_map', 'search_metadata'])(
  'deletes safely with only %s absent and lets normal initialization restore search', async (table) => {
    initializeWorkspaceSearchSidecar(openDatabaseConnection());
    openDatabaseConnection().driver.execute(`DROP TABLE search.${table}`);
    await handleNodeMutationCommand('delete_nodes_permanently', { nodeIds: ['removed'] });
    expectDeleted();
    const remainingTables = searchTables().map(({ name }) => name);
    expect(remainingTables).not.toContain(table);
    for (const existing of remainingTables.filter((name) => name !== 'search_metadata')) {
      expect(openDatabaseConnection().driver.queryAll(`SELECT node_id FROM search.${existing} WHERE node_id = 'removed'`)).toEqual([]);
    }
    closeDatabaseConnection();
    initializeDatabase(undefined, { recovery: 'fail' });
    expectDeleted();
    expect(searchWorkspace('removed')).toEqual([]);
    expect(searchWorkspace('survivor').map(({ id }) => id)).toEqual(['survivor']);
  }
);

it('persists newly created nodes and pending work before the separate search schema is initialized', () => {
  const readPending = () => openDatabaseConnection().driver.queryAll<{ target_id: string }>(
    'SELECT target_id FROM main.search_index_invalidations ORDER BY target_id'
  );
  expect(getNodeRow('removed')?.content).toBe('# removed');
  expect(readPending()).toEqual([{ target_id: 'removed' }, { target_id: 'survivor' }]);
  expect(searchTables()).toEqual([]);
  closeDatabaseConnection();
  initializeDatabase(undefined, { deferSearchIndex: true, recovery: 'fail' });
  expect(getNodeRow('removed')?.content).toBe('# removed');
  expect(readPending()).toEqual([{ target_id: 'removed' }, { target_id: 'survivor' }]);
  expect(searchTables()).toEqual([]);
  initializeWorkspaceSearchSidecar(openDatabaseConnection());
  expect(searchTables()).toHaveLength(4);
  expect(readPending()).toEqual([]);
  expect(searchWorkspace('removed').map(({ id }) => id)).toEqual(['removed']);
});
