// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-sync-review-convergence-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { applyCompanionSyncPushAsync } from './companionSyncPushAsyncApply.js';
import type { CompanionSyncPushPayload } from './companionSyncPushTypes.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-review-convergence-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-1', 'item', 'Node', '', '2026-04-30T00:00:00.000Z', '2026-04-30T00:00:00.000Z')`
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createOrderedReviewPush(
  lastReviewAt: string | null,
  reps: number,
  contentHash: string
): CompanionSyncPushPayload {
  return {
    authorHostName: 'android-device',
    base: { baseContentHash: null, kind: 'content_hash' },
    clientOpId: `node_review:node-1:${contentHash}`,
    contentHash,
    identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' },
    payloadJson: JSON.stringify({
      difficulty: 2,
      due: `due:${contentHash}`,
      elapsed_days: 0,
      lapses: 0,
      last_review_at: lastReviewAt,
      reps,
      scheduled_days: 1,
      stability: 3,
      state: 1
    }),
    updatedAt: lastReviewAt ?? '2026-04-29T00:00:00.000Z'
  };
}

function readReview() {
  return openDatabaseConnection().driver.queryOne<{ due: string; last_review_at: string; reps: number }>(
    `SELECT due, last_review_at, reps FROM node_review WHERE node_id = 'node-1'`
  );
}

it('keeps the latest complete review when newer arrives before older', async () => {
  const newer = createOrderedReviewPush('2026-04-30T03:00:00.000Z', 3, 'review-newer');
  const older = createOrderedReviewPush('2026-04-30T02:00:00.000Z', 2, 'review-older');

  await applyCompanionSyncPushAsync([newer, older], 'android-device');

  expect(readReview()).toEqual({
    due: 'due:review-newer', last_review_at: '2026-04-30T03:00:00.000Z', reps: 3
  });
});

it('keeps the latest complete review when older arrives first and rejects reps zero regression', async () => {
  const older = createOrderedReviewPush('2026-04-30T02:00:00.000Z', 2, 'review-older');
  const newer = createOrderedReviewPush('2026-04-30T03:00:00.000Z', 3, 'review-newer');
  const zero = createOrderedReviewPush(null, 0, 'review-zero');

  await applyCompanionSyncPushAsync([older, newer, zero], 'android-device');

  expect(readReview()).toEqual({
    due: 'due:review-newer', last_review_at: '2026-04-30T03:00:00.000Z', reps: 3
  });
});
