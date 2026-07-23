// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-time-semantics-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { saveNodeOpenState } from './nodeOpenState.js';
import { saveNodeReadingState } from './nodeReadingState.js';

let tempRoot = '';
const NODE_ID = 'node-time-1';
const MODIFIED_AT = '2026-07-20T00:00:00.000Z';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-time-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  upsertNodeSnapshot({
    anchorLink: null, content: 'Body', createdAt: MODIFIED_AT, isTitleManual: true,
    kind: 'topic', nodeId: NODE_ID, parentNodeId: null, position: 0, reveal: null,
    title: 'Time semantics', updatedAt: MODIFIED_AT
  });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('stores last opened independently and keeps the latest cross-device fact', () => {
  expect(saveNodeOpenState({ nodeId: NODE_ID, lastOpenedAt: '2026-07-22T00:00:00.000Z' })).toMatchObject({
    lastOpenedAt: '2026-07-22T00:00:00.000Z'
  });
  expect(saveNodeOpenState({ nodeId: NODE_ID, lastOpenedAt: '2026-07-21T00:00:00.000Z' })).toMatchObject({
    lastOpenedAt: '2026-07-22T00:00:00.000Z'
  });
  expect(nodeRow()).toMatchObject({ updated_at: MODIFIED_AT });
});

it('writes reading progress without changing modified time or creating a node content version', () => {
  const versionsBefore = nodeVersionCount();
  saveNodeReadingState({
    nodeId: NODE_ID,
    reading: {
      intervalDurationMs: 120_000, intervalGrowthFactor: 1.5,
      lastHandledAt: '2026-07-22T00:00:00.000Z', nextAt: '2026-07-23T00:00:00.000Z',
      priority: 3, readingPosition: 12, repetitionCount: 2, state: 'active'
    },
    updatedAt: '2026-07-22T00:00:00.000Z'
  });

  expect(nodeRow()).toMatchObject({ updated_at: MODIFIED_AT });
  expect(nodeVersionCount()).toBe(versionsBefore);
});

function nodeRow() {
  return openDatabaseConnection().driver.queryOne<{ updated_at: string }>(
    'SELECT updated_at FROM nodes WHERE id = ?', [NODE_ID]
  );
}

function nodeVersionCount() {
  return openDatabaseConnection().driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM node_sync_versions WHERE object_id = ?', [NODE_ID]
  )?.count ?? 0;
}
