// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-search-index-invalidation-prune-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import {
  countCompletedSearchIndexInvalidationsOlderThan,
  pruneCompletedSearchIndexInvalidations,
  readSearchIndexInvalidationRetentionStatusCounts
} from '../../lib/core/database/searchIndexInvalidationPruning.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds, processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-index-invalidation-prune-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  vi.useRealTimers();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertInvalidation(status: string, completedAt: string | null) {
  openDatabaseConnection()
    .sqlite.prepare(
      `INSERT INTO search_index_invalidations (
         invalidation_type, target_id, status, attempts, last_error, created_at, updated_at, claimed_at, completed_at
       ) VALUES ('node_workspace', ?, ?, 0, NULL, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', NULL, ?)`
    )
    .run(`target-${status}-${completedAt ?? 'none'}`, status, completedAt);
}

it('prunes only completed invalidations older than the explicit ISO boundary', () => {
  insertInvalidation('completed', '2026-05-01T00:00:00.000Z');
  insertInvalidation('completed', '2026-05-20T00:00:00.000Z');
  insertInvalidation('pending', null);
  insertInvalidation('running', null);
  insertInvalidation('failed', null);

  expect(
    countCompletedSearchIndexInvalidationsOlderThan(
      openDatabaseConnection().driver,
      '2026-05-10T00:00:00.000Z'
    )
  ).toBe(1);

  expect(readSearchIndexInvalidationRetentionStatusCounts(openDatabaseConnection().driver)).toEqual({
    failedRows: 1,
    pendingRows: 1,
    runningRows: 1
  });

  expect(
    pruneCompletedSearchIndexInvalidations(
      openDatabaseConnection().driver,
      '2026-05-10T00:00:00.000Z'
    )
  ).toBe(1);

  expect(
    openDatabaseConnection()
      .sqlite.prepare(
        'SELECT status, COUNT(*) AS rows FROM search_index_invalidations GROUP BY status ORDER BY status'
      )
      .all()
  ).toEqual([
    { status: 'completed', rows: 1 },
    { status: 'failed', rows: 1 },
    { status: 'pending', rows: 1 },
    { status: 'running', rows: 1 }
  ]);
});

it('automatically retires all completions on an idle processing pass and preserves other states across reopen', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-20T00:00:00.000Z'));
  insertInvalidation('completed', '2026-05-12T23:59:59.999Z');
  insertInvalidation('completed', '2026-05-13T00:00:00.000Z');
  insertInvalidation('completed', '2026-05-20T00:00:00.000Z');
  insertInvalidation('completed', null);
  insertInvalidation('pending', '2026-05-01T00:00:00.000Z');
  insertInvalidation('running', '2026-05-01T00:00:00.000Z');
  insertInvalidation('failed', '2026-05-01T00:00:00.000Z');
  const driver = openDatabaseConnection().driver;
  const activeBefore = driver.queryAll(
    "SELECT * FROM search_index_invalidations WHERE status != 'completed' ORDER BY id"
  );

  expect(processSearchIndexInvalidations(driver, 0)).toEqual({ failed: 0, processed: 0 });
  expect(driver.queryOne(
    "SELECT COUNT(*) AS count FROM search_index_invalidations WHERE status = 'completed'"
  )).toEqual({ count: 0 });
  closeDatabaseConnection();
  const reopened = openDatabaseConnection().driver;
  expect(reopened.queryAll(
    "SELECT * FROM search_index_invalidations WHERE status != 'completed' ORDER BY id"
  )).toEqual(activeBefore.map((row) => ({ ...row, status: 'pending' })));
  vi.setSystemTime(new Date('2026-05-28T00:00:00.000Z'));
  processSearchIndexInvalidations(reopened, 0);
  expect(reopened.queryOne(
    "SELECT COUNT(*) AS count FROM search_index_invalidations WHERE status = 'completed'"
  )).toEqual({ count: 0 });
});

it('removes newly successful work immediately and persists its searchable result across reopen', () => {
  const driver = openDatabaseConnection().driver;
  processSearchIndexInvalidations(driver);
  driver.execute("UPDATE nodes SET title = 'ImmediateRetirementSentinel' WHERE id = 'special-inbox'");
  enqueueWorkspaceSearchInvalidationForNodeIds(driver, ['special-inbox']);
  expect(processSearchIndexInvalidations(driver)).toEqual({ failed: 0, processed: 1 });
  closeDatabaseConnection();
  const reopened = openDatabaseConnection().driver;
  expect(reopened.queryAll('SELECT * FROM search_index_invalidations')).toEqual([]);
  expect(reopened.queryOne(
    "SELECT node_id FROM search.node_search WHERE node_search MATCH 'ImmediateRetirementSentinel'"
  )).toEqual({ node_id: 'special-inbox' });
});

it('retains failed completion work for retry when the final transaction cannot commit', () => {
  const connection = openDatabaseConnection();
  processSearchIndexInvalidations(connection.driver);
  enqueueWorkspaceSearchInvalidationForNodeIds(connection.driver, ['special-inbox']);
  connection.sqlite.exec(`CREATE TRIGGER reject_task_retirement BEFORE DELETE ON search_index_invalidations
    WHEN OLD.target_id = 'special-inbox' BEGIN SELECT RAISE(ABORT, 'retirement blocked'); END`);
  expect(processSearchIndexInvalidations(connection.driver)).toEqual({ failed: 1, processed: 0 });
  expect(connection.driver.queryOne(
    'SELECT status, attempts FROM search_index_invalidations WHERE target_id = ?', ['special-inbox']
  )).toEqual({ status: 'pending', attempts: 1 });
  connection.sqlite.exec('DROP TRIGGER reject_task_retirement');
  closeDatabaseConnection();
  const reopened = openDatabaseConnection().driver;
  expect(processSearchIndexInvalidations(reopened)).toEqual({ failed: 0, processed: 1 });
  expect(reopened.queryAll('SELECT * FROM search_index_invalidations')).toEqual([]);
});
