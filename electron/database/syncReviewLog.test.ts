// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-review-log-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type {
  NativeSyncObjectRecord,
  NativeSyncReviewLogRecord
} from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjects } from './syncObjectApply.js';
import { applySyncReviewLog, loadSyncReviewLogSince } from './syncReviewLog.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-review-log-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertReviewLog(opId: string, reviewedAt: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    ['node-1', 'item', 'Node 1', '', '2026-04-25T00:00:00.000Z', '2026-04-25T00:00:00.000Z']
  );
  openDatabaseConnection().driver.execute(
    `INSERT INTO review_log (
       id, op_id, device_id, node_id, grade, scheduler_version, reviewed_at,
       due_before, stability_before, difficulty_before, due_after, stability_after, difficulty_after
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [`log-${opId}`, opId, 'desktop', 'node-1', 3, 'test', reviewedAt,
      '2026-04-24T00:00:00.000Z', 1, 2, '2026-04-25T00:00:00.000Z', 3, 4]
  );
}

function createMobileLearningStateRecords(): NativeSyncObjectRecord[] {
  return [{
    content_hash: 'hash-reading-mobile',
    deleted_at: null,
      object_id: 'node-1',
      object_type: 'node_reading',
      payload_json: JSON.stringify({
      interval_duration_ms: 1200,
      interval_growth_factor: 1.2,
      last_handled_at: '2026-04-25T00:09:00.000Z',
      next_at: '2026-04-25T02:09:00.000Z',
      priority: 1,
      reading_position: 512,
      repetition_count: 2,
      state: 'active'
    }),
    updated_at: '2026-04-25T00:09:00.000Z'
  }, {
    content_hash: 'hash-review-mobile',
    deleted_at: null,
      object_id: 'node-1',
      object_type: 'node_review',
      payload_json: JSON.stringify({
        difficulty: 3.4,
        due: '2026-04-26T00:00:00.000Z',
      elapsed_days: 0,
      lapses: 0,
      last_review_at: '2026-04-25T00:10:00.000Z',
      reps: 4,
      scheduled_days: 1,
      stability: 2.8,
      state: 2
    }),
    updated_at: '2026-04-25T00:10:00.000Z'
  }];
}

function createMobileReviewLog(opId: string): NativeSyncReviewLogRecord {
  return {
    device_id: 'android-test',
    difficulty_after: 3.4,
    difficulty_before: 4.2,
    due_after: '2026-04-26T00:00:00.000Z',
    due_before: '2026-04-25T00:00:00.000Z',
    grade: 3,
    id: `log-${opId}`,
    node_id: 'node-1',
    op_id: opId,
    reviewed_at: '2026-04-25T00:10:00.000Z',
    scheduler_version: 'ts-fsrs@4',
    stability_after: 2.8,
    stability_before: 2.1
  };
}

it('loads review log records after the reviewed_at/op_id cursor', () => {
  insertReviewLog('op-1', '2026-04-25T00:00:00.000Z');
  insertReviewLog('op-2', '2026-04-25T00:00:00.000Z');

  expect(loadSyncReviewLogSince({ reviewedAt: '2026-04-25T00:00:00.000Z', opId: 'op-1' }, 10))
    .toEqual([
      expect.objectContaining({
        op_id: 'op-2',
        reviewed_at: '2026-04-25T00:00:00.000Z'
      })
    ]);
});

it('applies mobile review state and review log without duplicating op ids', () => {
  insertReviewLog('seed-op', '2026-04-24T00:00:00.000Z');
  applySyncObjects([{
    content_hash: 'hash-review-mobile',
    deleted_at: null,
    object_id: 'node-1',
      object_type: 'node_review',
      payload_json: JSON.stringify({
        difficulty: 3.4,
        due: '2026-04-26T00:00:00.000Z',
      elapsed_days: 0,
      lapses: 0,
      last_review_at: '2026-04-25T00:10:00.000Z',
      reps: 4,
      scheduled_days: 1,
      stability: 2.8,
      state: 2
    }),
    updated_at: '2026-04-25T00:10:00.000Z'
  }]);

  const mobileReview = {
    device_id: 'android-test',
    difficulty_after: 3.4,
    difficulty_before: 4.2,
    due_after: '2026-04-26T00:00:00.000Z',
    due_before: '2026-04-25T00:00:00.000Z',
    grade: 3,
    id: 'mobile-log-1',
    node_id: 'node-1',
    op_id: 'mobile-op-1',
    reviewed_at: '2026-04-25T00:10:00.000Z',
    scheduler_version: 'ts-fsrs@4',
    stability_after: 2.8,
    stability_before: 2.1
  };

  expect(applySyncReviewLog([mobileReview, mobileReview])).toEqual(['mobile-op-1']);
  expect(openDatabaseConnection().driver.queryOne<{ last_review_at: string }>(
    'SELECT last_review_at FROM node_review WHERE node_id = ?',
    ['node-1']
  )).toEqual({ last_review_at: '2026-04-25T00:10:00.000Z' });
  expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM review_log WHERE op_id = ?',
    ['mobile-op-1']
  )).toEqual({ count: 1 });
});

it('can acknowledge already applied review log ops for push cursor delivery', () => {
  insertReviewLog('mobile-op-1', '2026-04-25T00:10:00.000Z');

  expect(applySyncReviewLog([createMobileReviewLog('mobile-op-1')], { includeAlreadyApplied: true }))
    .toEqual(['mobile-op-1']);
});

it('applies mobile learning state and review event as clean desktop facts', () => {
  insertReviewLog('seed-op', '2026-04-24T00:00:00.000Z');

  expect(applySyncObjects(createMobileLearningStateRecords())).toEqual(['node_reading:node-1', 'node_review:node-1']);
  expect(applySyncReviewLog([createMobileReviewLog('mobile-op-2')])).toEqual(['mobile-op-2']);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ reading_position: number }>(
    'SELECT reading_position FROM node_reading WHERE node_id = ?',
    ['node-1']
  )).toEqual({ reading_position: 512 });
  expect(driver.queryOne<{ last_review_at: string; reps: number }>(
    'SELECT last_review_at, reps FROM node_review WHERE node_id = ?',
    ['node-1']
  )).toEqual({ last_review_at: '2026-04-25T00:10:00.000Z', reps: 4 });
  expect(driver.queryAll<{ object_type: string; sync_dirty: number }>(
    `SELECT object_type, sync_dirty
     FROM sync_object_state
     WHERE object_id = ?
     ORDER BY object_type ASC`,
    ['node-1']
  )).toEqual([
    { object_type: 'node_reading', sync_dirty: 0 },
    { object_type: 'node_review', sync_dirty: 0 }
  ]);
  expect(driver.queryOne<{ device_id: string }>(
    'SELECT device_id FROM review_log WHERE op_id = ?',
    ['mobile-op-2']
  )).toEqual({ device_id: 'android-test' });
});
