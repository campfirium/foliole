// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-review-snapshot-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-review-snapshot-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('loads persisted initial review profiles from sqlite snapshot', () => {
  upsertNodeSnapshot({
    nodeId: 'node-review',
    parentNodeId: null,
    kind: 'item',
    title: 'Review node',
    isTitleManual: true,
    content: 'Prompt',
    reveal: 'Answer',
    anchorLink: null,
    review: {
      due: '2026-05-22T00:00:00.000Z',
      lastReviewAt: null,
      state: 0,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0
    },
    position: 0,
    createdAt: '2026-05-21T08:00:00.000Z',
    updatedAt: '2026-05-21T08:00:00.000Z'
  });

  expect(loadWorkspaceSnapshot()?.nodesById['node-review']?.review).toEqual({
    due: '2026-05-22T00:00:00.000Z',
    lastReviewAt: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0
  });
});
