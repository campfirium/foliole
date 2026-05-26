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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-index-invalidation-prune-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
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
