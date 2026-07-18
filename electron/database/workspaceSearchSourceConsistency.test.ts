// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-search-source-consistency-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import {
  enqueueWorkspaceSearchInvalidationForNodeIds,
  processSearchIndexInvalidations
} from '../../lib/core/database/searchIndexInvalidations.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import {
  WORKSPACE_SEARCH_SOURCE_IDENTITY_KEY,
  workspaceSearchSourceStateMatches
} from '../../lib/core/database/workspaceSearchSourceState.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-source-consistency-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  processSearchIndexInvalidations(openDatabaseConnection().driver);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('reuses a ready sidecar while the main source identity and revision still match', () => {
  const connection = openDatabaseConnection();
  const rebuild = vi.fn();

  expect(workspaceSearchSourceStateMatches(connection.driver)).toBe(true);
  initializeWorkspaceSearchSidecar(connection, { rebuildWorkspaceSearchIndexes: rebuild });

  expect(rebuild).not.toHaveBeenCalled();
});

it('rebuilds through the shared initializer when another main database identity is opened', () => {
  const connection = openDatabaseConnection();
  const rebuild = vi.fn();
  connection.driver.execute(
    'UPDATE settings SET value = ?, updated_at = ? WHERE key = ?',
    ['replacement-database', '2026-07-18T00:00:00.000Z', WORKSPACE_SEARCH_SOURCE_IDENTITY_KEY]
  );

  initializeWorkspaceSearchSidecar(connection, { rebuildWorkspaceSearchIndexes: rebuild });

  expect(rebuild).toHaveBeenCalledOnce();
  expect(workspaceSearchSourceStateMatches(connection.driver)).toBe(true);
});

it('recovers interrupted invalidations without marking their source revision indexed early', () => {
  const connection = openDatabaseConnection();
  enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, ['special-inbox']);
  connection.driver.execute(
    `UPDATE search_index_invalidations
     SET status = 'running', claimed_at = updated_at
     WHERE target_id = ? AND status = 'pending'`,
    ['special-inbox']
  );

  initializeWorkspaceSearchSidecar(connection, { rebuildWorkspaceSearchIndexes: vi.fn() });

  expect(
    connection.driver.queryOne<{ status: string }>(
      'SELECT status FROM search_index_invalidations WHERE target_id = ? ORDER BY id DESC LIMIT 1',
      ['special-inbox']
    )
  ).toEqual({ status: 'failed' });
  expect(workspaceSearchSourceStateMatches(connection.driver)).toBe(false);

  processSearchIndexInvalidations(connection.driver);
  expect(workspaceSearchSourceStateMatches(connection.driver)).toBe(true);
});

it('keeps search source settings out of synced setting records', () => {
  const connection = openDatabaseConnection();
  expect(
    connection.driver.queryOne<{ count: number }>(
      `SELECT (
         SELECT COUNT(*) FROM setting_records WHERE key LIKE 'workspace_search_%'
       ) + (
         SELECT COUNT(*) FROM sync_object_state
         WHERE object_type = 'setting' AND object_id LIKE '%workspace_search_%'
       ) AS count`
    )
  ).toEqual({ count: 0 });
});
