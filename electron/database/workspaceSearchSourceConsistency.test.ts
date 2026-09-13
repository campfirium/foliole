// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
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
import { initializeWorkspaceSearchSidecar, rebuildWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';
import {
  advanceWorkspaceSearchSourceRevision,
  WORKSPACE_SEARCH_SOURCE_IDENTITY_KEY,
  workspaceSearchSourceStateMatches
} from '../../lib/core/database/workspaceSearchSourceState.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';
const BetterSqlite3 = createRequire(import.meta.url)('better-sqlite3') as typeof import('better-sqlite3');

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
  const rebuild = vi.fn();
  enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, ['special-inbox']);
  connection.driver.execute(
    `UPDATE search_index_invalidations
     SET status = 'running', claimed_at = updated_at
     WHERE target_id = ? AND status = 'pending'`,
    ['special-inbox']
  );

  initializeWorkspaceSearchSidecar(connection, { rebuildWorkspaceSearchIndexes: rebuild });

  expect(rebuild).not.toHaveBeenCalled();

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

it('resumes persisted content changes across reopen without a full rebuild and makes them searchable', () => {
  const connection = openDatabaseConnection();
  connection.driver.execute('UPDATE nodes SET title = ? WHERE id = ?', ['BacklogSearchSentinel', 'special-inbox']);
  enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, ['special-inbox']);
  closeDatabaseConnection();
  const reopened = openDatabaseConnection();
  const rebuild = vi.fn();

  initializeWorkspaceSearchSidecar(reopened, { rebuildWorkspaceSearchIndexes: rebuild });

  expect(rebuild).not.toHaveBeenCalled();
  expect(workspaceSearchSourceStateMatches(reopened.driver)).toBe(false);
  expect(processSearchIndexInvalidations(reopened.driver)).toEqual({ failed: 0, processed: 1 });
  expect(workspaceSearchSourceStateMatches(reopened.driver)).toBe(true);
  expect(reopened.driver.queryOne(
    "SELECT node_id FROM search.node_search WHERE node_search MATCH 'BacklogSearchSentinel'"
  )).toEqual({ node_id: 'special-inbox' });
});

it('retains rebuild provenance while pending work remains so reopening does not rebuild again', () => {
  const connection = openDatabaseConnection();
  enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, ['special-inbox']);
  rebuildWorkspaceSearchSidecar(connection, { strategy: 'word-based' });
  expect(workspaceSearchSourceStateMatches(connection.driver)).toBe(false);
  closeDatabaseConnection();
  const reopened = openDatabaseConnection();
  const rebuild = vi.fn();

  initializeWorkspaceSearchSidecar(reopened, { rebuildWorkspaceSearchIndexes: rebuild });

  expect(rebuild).not.toHaveBeenCalled();
  expect(processSearchIndexInvalidations(reopened.driver)).toEqual({ failed: 0, processed: 1 });
  expect(workspaceSearchSourceStateMatches(reopened.driver)).toBe(true);
});

it('rebuilds when source changes have no durable incremental coverage', () => {
  const connection = openDatabaseConnection();
  advanceWorkspaceSearchSourceRevision(connection.driver);
  const rebuild = vi.fn();

  initializeWorkspaceSearchSidecar(connection, { rebuildWorkspaceSearchIndexes: rebuild });

  expect(rebuild).toHaveBeenCalledOnce();
  expect(workspaceSearchSourceStateMatches(connection.driver)).toBe(true);
});

it('opens usable application data without building a missing index on the desktop startup path', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec('DROP TABLE search.node_search');
  closeDatabaseConnection();

  const reopened = initializeDatabase(undefined, { deferSearchIndex: true });

  expect(reopened.driver.queryOne("SELECT id FROM nodes WHERE id = 'special-inbox'")).toEqual({ id: 'special-inbox' });
  expect(reopened.driver.queryOne("SELECT name FROM search.sqlite_master WHERE name = 'node_search'")).toBeUndefined();
  initializeWorkspaceSearchSidecar(reopened);
  expect(reopened.driver.queryOne("SELECT name FROM search.sqlite_master WHERE name = 'node_search'")).toEqual({ name: 'node_search' });
});

it('allows foreground writes while a rebuild reads a consistent main database snapshot', () => {
  const connection = openDatabaseConnection();
  const foreground = new BetterSqlite3(connection.dbPath, { timeout: 0 });
  try {
    const status = rebuildWorkspaceSearchSidecar(connection, {
      strategy: 'word-based',
      rebuildWorkspaceSearchIndexes: (driver) => {
        driver.queryOne('SELECT COUNT(*) AS count FROM nodes');
        foreground.prepare("UPDATE nodes SET opening_text = 'foreground edit' WHERE id = 'special-inbox'").run();
      }
    });
    expect(status.status).toBe('ready');
    expect(foreground.prepare("SELECT opening_text FROM nodes WHERE id = 'special-inbox'").get())
      .toEqual({ opening_text: 'foreground edit' });
  } finally {
    foreground.close();
  }
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
