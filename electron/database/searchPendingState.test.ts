// @vitest-environment node
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const Database = createRequire(import.meta.url)('better-sqlite3') as typeof import('better-sqlite3');
let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: root, app_cache_dir: `${root}/cache`, app_config_dir: `${root}/config`, app_log_dir: `${root}/logs`
}) }));

import { enqueueWorkspaceSearchInvalidationForNodeIds, enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds,
  processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';
import { rebuildWorkspaceSearchIndexes } from '../../lib/core/database/workspaceSearchIndex.js';
import { rebuildWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import { enqueueAppliedNodeBodySearchInvalidation } from '../../lib/core/sync/syncNodeSearchInvalidations.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { deleteNodesPermanently } from './nodeMutations.js';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-pending-'));
  initializeDatabase();
  processSearchIndexInvalidations(openDatabaseConnection().driver);
});
afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});
function states() {
  return openDatabaseConnection().driver.queryAll('SELECT id, status, last_error FROM search_index_invalidations');
}

it('keeps one pending state for an article across repeated changes of different kinds', () => {
  const driver = openDatabaseConnection().driver;
  enqueueWorkspaceSearchInvalidationForNodeIds(driver, ['special-inbox']);
  enqueueWorkspaceSearchPathInvalidationForSubtreeRootIds(driver, ['special-inbox']);
  enqueueWorkspaceSearchInvalidationForNodeIds(driver, ['special-inbox']);
  expect(states()).toHaveLength(1);
  expect(states()[0]).toMatchObject({ status: 'pending' });
});

it('keeps a failed attempt pending and replaces it with one fresh state on a new edit', () => {
  const driver = openDatabaseConnection().driver;
  enqueueWorkspaceSearchInvalidationForNodeIds(driver, ['special-inbox']);
  driver.execute('DROP TABLE search.node_search');
  expect(processSearchIndexInvalidations(driver)).toEqual({ failed: 1, processed: 0 });
  expect(states()).toHaveLength(1);
  expect(states()[0]).toMatchObject({ status: 'pending', last_error: expect.any(String) });
  enqueueWorkspaceSearchInvalidationForNodeIds(driver, ['special-inbox']);
  expect(states()).toHaveLength(1);
  expect(states()[0]).toMatchObject({ status: 'pending', last_error: null });
});

it('keeps the new state when the article changes while its previous state is being processed', () => {
  const connection = openDatabaseConnection();
  enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, ['special-inbox']);
  const original = connection.driver.execute.bind(connection.driver);
  const foreground = new Database(connection.dbPath);
  const foregroundDriver = createBetterSqlite3Driver(foreground);
  let changed = false;
  vi.spyOn(connection.driver, 'execute').mockImplementation((sql, params) => {
    const result = original(sql, params);
    if (!changed && sql.includes('INSERT INTO search.node_search')) {
      changed = true;
      foregroundDriver.execute("UPDATE nodes SET title = 'NewerPendingSentinel' WHERE id = 'special-inbox'");
      enqueueWorkspaceSearchInvalidationForNodeIds(foregroundDriver, ['special-inbox']);
    }
    return result;
  });
  expect(processSearchIndexInvalidations(connection.driver)).toEqual({ failed: 0, processed: 1 });
  foreground.close();
  expect(changed).toBe(true);
  expect(states()).toHaveLength(1);
  expect(processSearchIndexInvalidations(connection.driver)).toEqual({ failed: 0, processed: 1 });
  expect(states()).toEqual([]);
  expect(connection.driver.queryOne(
    "SELECT node_id FROM search.node_search WHERE node_search MATCH 'NewerPendingSentinel'"
  )).toEqual({ node_id: 'special-inbox' });
});

it('clears obsolete article state together with its index on permanent deletion', () => {
  const driver = openDatabaseConnection().driver;
  enqueueWorkspaceSearchInvalidationForNodeIds(driver, ['special-inbox']);
  deleteNodesPermanently({ nodeIds: ['special-inbox'], nodeOrder: [] });
  expect(states()).toEqual([]);
  expect(driver.queryOne("SELECT node_id FROM search.node_search WHERE node_id = 'special-inbox'")).toBeUndefined();
});

it('retires covered states after a successful full rebuild', () => {
  const connection = openDatabaseConnection();
  enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, ['special-inbox']);
  expect(rebuildWorkspaceSearchSidecar(connection, { strategy: 'word-based' }).status).toBe('ready');
  expect(states()).toEqual([]);
});

it('coalesces sync-applied changes into the same article state as local edits', async () => {
  const connection = openDatabaseConnection();
  enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, ['special-inbox']);
  await createBetterSqliteDbPort(connection.sqlite).transaction(async (tx) => {
    await enqueueAppliedNodeBodySearchInvalidation(tx, 'special-inbox', new Date().toISOString());
  });
  expect(states()).toHaveLength(1);
  expect(states()[0]).toMatchObject({ status: 'pending' });
});

it('preserves a newer foreground state that arrived during a full rebuild snapshot', () => {
  const connection = openDatabaseConnection();
  enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, ['special-inbox']);
  const foreground = new Database(connection.dbPath);
  const foregroundDriver = createBetterSqlite3Driver(foreground);
  try {
    const result = rebuildWorkspaceSearchSidecar(connection, {
      strategy: 'word-based',
      rebuildWorkspaceSearchIndexes: (driver) => {
        rebuildWorkspaceSearchIndexes(driver);
        foregroundDriver.transaction(() => {
          foregroundDriver.execute("UPDATE nodes SET title = 'RebuildNewerSentinel' WHERE id = 'special-inbox'");
          enqueueWorkspaceSearchInvalidationForNodeIds(foregroundDriver, ['special-inbox']);
        });
      }
    });
    expect(result.status).toBe('ready');
    expect(states()).toHaveLength(1);
    expect(processSearchIndexInvalidations(connection.driver)).toEqual({ failed: 0, processed: 1 });
    expect(states()).toEqual([]);
    expect(connection.driver.queryOne(
      "SELECT node_id FROM search.node_search WHERE node_search MATCH 'RebuildNewerSentinel'"
    )).toEqual({ node_id: 'special-inbox' });
  } finally { foreground.close(); }
});

it('keeps the pending state when a full rebuild fails', () => {
  const connection = openDatabaseConnection();
  enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, ['special-inbox']);
  expect(rebuildWorkspaceSearchSidecar(connection, {
    strategy: 'word-based', rebuildWorkspaceSearchIndexes: () => { throw new Error('rebuild interrupted'); }
  }).status).toBe('failed');
  expect(states()).toHaveLength(1);
  expect(states()[0]).toMatchObject({ status: 'pending' });
});

it('keeps an unavailable body pending instead of declaring an empty search body updated', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute("UPDATE nodes SET body_blob_hash = ? WHERE id = 'special-inbox'", ['b'.repeat(64)]);
  enqueueWorkspaceSearchInvalidationForNodeIds(driver, ['special-inbox']);
  expect(processSearchIndexInvalidations(driver)).toEqual({ failed: 1, processed: 0 });
  expect(states()).toHaveLength(1);
  expect(states()[0]).toMatchObject({ status: 'pending', last_error: expect.stringContaining('node_body_unavailable') });
  driver.execute("UPDATE nodes SET body_blob_hash = NULL WHERE id = 'special-inbox'");
  expect(processSearchIndexInvalidations(driver)).toEqual({ failed: 0, processed: 1 });
  expect(states()).toEqual([]);
});
