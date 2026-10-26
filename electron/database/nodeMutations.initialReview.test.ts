// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-initial-review-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import {
  getNodeReviewRow,
  getNodeReviewSyncRow,
  getReviewCounts
} from './nodeMutations.test.helpers.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-initial-review-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it.each([false, true])('creates an item while ignoring graded snapshots (graded=%s)', (graded) => {
  const input = {
    nodeId: 'node-review',
    parentNodeId: null,
    kind: 'item',
    title: 'node-review',
    isTitleManual: true,
    content: 'Prompt',
    reveal: 'Answer',
    anchorLink: null,
    review: {
      due: '2026-05-22T00:00:00.000Z',
      lastReviewAt: graded ? '2026-05-21T00:00:00.000Z' : null,
      state: graded ? 2 : 0,
      stability: 7,
      difficulty: 5,
      elapsedDays: 3,
      scheduledDays: 6,
      reps: graded ? 4 : 0,
      lapses: 1
    },
    position: 0,
    createdAt: '2026-05-21T08:00:00.000Z',
    updatedAt: '2026-05-21T08:00:00.000Z'
  } satisfies Parameters<typeof upsertNodeSnapshot>[0];
  upsertNodeSnapshot(input);
  closeDatabaseConnection();

  const expected = graded ? undefined : {
    due: input.review.due, last_review_at: null, reps: 0, state: 0
  };
  expect(getNodeReviewRow('node-review')).toEqual(expected);
  if (!graded) {
    expect(openDatabaseConnection().sqlite.prepare(
      'SELECT stability, difficulty, elapsed_days, scheduled_days, lapses FROM node_review WHERE node_id = ?'
    ).get(input.nodeId)).toEqual({ stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, lapses: 0 });
  }
  expect(getReviewCounts('node-review')).toEqual({ reviewCount: graded ? 0 : 1, reviewLogCount: 0 });
  expect(getNodeReviewSyncRow('node-review')).toBeUndefined();

  upsertNodeSnapshot({ ...input, content: 'Edited prompt', review: { ...input.review,
    due: '2099-01-01T00:00:00.000Z', reps: 9, state: 2, lastReviewAt: '2026-05-21T09:00:00.000Z' } });
  closeDatabaseConnection();
  expect(getNodeReviewRow('node-review')).toEqual(expected);
  expect(getReviewCounts('node-review')).toEqual({ reviewCount: graded ? 0 : 1, reviewLogCount: 0 });
  expect(getNodeReviewSyncRow('node-review')).toBeUndefined();
});
