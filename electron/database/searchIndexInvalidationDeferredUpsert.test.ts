// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-search-index-deferred-upsert-tests';

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
import {
  readWorkspaceSearchSourceState,
  workspaceSearchSourceStateMatches
} from '../../lib/core/database/workspaceSearchSourceState.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-index-deferred-upsert-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  processSearchIndexInvalidations(openDatabaseConnection().driver);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function pendingInvalidations() {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT invalidation_type, target_id, status
       FROM search_index_invalidations
       WHERE status != 'completed'
       ORDER BY invalidation_type ASC, target_id ASC`
    )
    .all() as Array<{ invalidation_type: string; status: string; target_id: string }>;
}

it('defers ordinary node edit workspace invalidation until the caller flushes it', () => {
  const driver = openDatabaseConnection().driver;
  const before = readWorkspaceSearchSourceState(driver)!;
  expect(workspaceSearchSourceStateMatches(driver)).toBe(true);

  upsertNodeSnapshot({
    anchorLink: null,
    content: 'Deferred atlas content',
    createdAt: '2026-05-16T10:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId: 'node-deferred',
    parentNodeId: null,
    position: null,
    reveal: null,
    title: 'Deferred Node',
    updatedAt: '2026-05-16T10:01:00.000Z'
  }, { searchInvalidation: { workspaceInvalidation: 'defer' } });

  expect(pendingInvalidations()).toEqual([]);
  expect(readWorkspaceSearchSourceState(driver)).toMatchObject({
    queuedRevision: before.revision,
    revision: before.revision + 1
  });
  expect(workspaceSearchSourceStateMatches(driver)).toBe(false);

  enqueueWorkspaceSearchInvalidationForNodeIds(
    driver,
    ['node-deferred'],
    { advanceSourceRevision: false }
  );
  expect(pendingInvalidations()).toEqual([
    { invalidation_type: 'node_workspace', status: 'pending', target_id: 'node-deferred' }
  ]);
  expect(readWorkspaceSearchSourceState(driver)).toMatchObject({
    queuedRevision: before.revision + 1,
    revision: before.revision + 1
  });
  expect(workspaceSearchSourceStateMatches(driver)).toBe(false);

  processSearchIndexInvalidations(driver);
  expect(workspaceSearchSourceStateMatches(driver)).toBe(true);
});
