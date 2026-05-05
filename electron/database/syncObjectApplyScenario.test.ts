// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-apply-scenario-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-apply-scenario-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    [nodeId, nodeId, '2026-04-21T10:00:00.000Z', '2026-04-21T10:00:00.000Z']
  );
}

function readingRecord(overrides: Partial<NativeSyncObjectRecord> = {}): NativeSyncObjectRecord {
  return {
    content_hash: 'reading-hash-1',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: JSON.stringify({
      interval_duration_ms: 1000,
      interval_growth_factor: 1.5,
      last_handled_at: '2026-04-21T16:00:00.000Z',
      next_at: '2026-04-22T16:00:00.000Z',
      priority: 2,
      reading_position: 7,
      repetition_count: 3,
      state: 'active'
    }),
    updated_at: '2026-04-21T16:00:00.000Z',
    ...overrides
  };
}

function reviewRecord(overrides: Partial<NativeSyncObjectRecord> = {}): NativeSyncObjectRecord {
  return {
    content_hash: 'review-hash-1',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_review',
    payload_json: JSON.stringify({
      difficulty: 4.25,
      due: '2026-04-24T16:00:00.000Z',
      elapsed_days: 2,
      lapses: 0,
      last_review_at: '2026-04-21T16:00:00.000Z',
      reps: 3,
      scheduled_days: 3,
      stability: 7.5,
      state: 2
    }),
    updated_at: '2026-04-21T16:00:00.000Z',
    ...overrides
  };
}

it('covers reading and review state apply, idempotency, stale ignore, and fresh update', async () => {
  insertNode('node-1');
  const initialRecords = [readingRecord(), reviewRecord()];

  await expect(applySyncObjectsAsync(initialRecords)).resolves.toEqual(['node_reading:node-1', 'node_review:node-1']);
  await expect(applySyncObjectsAsync(initialRecords)).resolves.toEqual([]);
  await expect(applySyncObjectsAsync([
    readingRecord({
      content_hash: 'reading-stale',
      payload_json: JSON.stringify({ next_at: '2026-04-20T16:00:00.000Z', state: 'done' }),
      updated_at: '2026-04-20T16:00:00.000Z'
    })
  ])).resolves.toEqual([]);
  await expect(applySyncObjectsAsync([
    reviewRecord({
      content_hash: 'review-hash-2',
      payload_json: JSON.stringify({
        difficulty: 3.5,
        due: '2026-04-28T16:00:00.000Z',
        elapsed_days: 4,
        lapses: 1,
        last_review_at: '2026-04-25T16:00:00.000Z',
        reps: 4,
        scheduled_days: 5,
        stability: 8,
        state: 3
      }),
      updated_at: '2026-04-25T16:00:00.000Z'
    })
  ])).resolves.toEqual(['node_review:node-1']);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ next_at: string; state: string }>(
    'SELECT next_at, state FROM node_reading WHERE node_id = ?',
    ['node-1']
  )).toEqual({ next_at: '2026-04-22T16:00:00.000Z', state: 'active' });
  expect(driver.queryOne<{ due: string; lapses: number; reps: number; state: number }>(
    'SELECT due, lapses, reps, state FROM node_review WHERE node_id = ?',
    ['node-1']
  )).toEqual({ due: '2026-04-28T16:00:00.000Z', lapses: 1, reps: 4, state: 3 });
  expect(driver.queryOne<{ dirty: number; hash: string }>(
    `SELECT sync_dirty AS dirty, content_hash AS hash FROM sync_object_state
     WHERE object_type = 'node_review' AND object_id = ?`,
    ['node-1']
  )).toEqual({ dirty: 0, hash: 'review-hash-2' });
});
