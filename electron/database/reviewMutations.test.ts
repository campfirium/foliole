// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-review-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import {
  DEFAULT_REVIEW_SCHEDULER_SETTINGS,
  getReviewSchedulerVersion
} from '../reviewSchedulerSettings.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { applyReviewGrade, resetNodeReviewState } from './reviewMutations.js';

let tempRoot = '';
const NODE_ID = 'node-qa-1';

const GRADE_INPUT = {
  nodeId: NODE_ID,
  grade: 3 as const,
  reviewedAt: '2026-03-06T00:00:00.000Z',
  cardBefore: {
    due: '2026-03-06T00:00:00.000Z',
    last_review: null,
    state: 0 as const,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0
  },
  cardAfter: {
    due: '2026-03-10T00:00:00.000Z',
    last_review: '2026-03-06T00:00:00.000Z',
    state: 1 as const,
    stability: 2.5,
    difficulty: 3.1,
    elapsed_days: 1,
    scheduled_days: 4,
    reps: 1,
    lapses: 0
  }
};

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-review-mutation-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedQaNode() {
  upsertNodeSnapshot({
    nodeId: NODE_ID,
    parentNodeId: null,
    kind: 'item',
    title: 'QA 1',
    isTitleManual: true,
    content: 'Q',
    reveal: 'A',
    anchorLink: null,
    position: 0,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

function selectReviewRow() {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare(
      `SELECT due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses
       FROM node_review WHERE node_id = ?`
    )
    .get(NODE_ID) as Record<string, unknown>;
}

function selectReviewLogRow() {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare(
      `SELECT node_id, grade, scheduler_version, reviewed_at, due_before, due_after, stability_before, stability_after
       FROM review_log WHERE node_id = ? LIMIT 1`
    )
    .get(NODE_ID) as Record<string, unknown>;
}

function selectSyncObjectState() {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare(
      `SELECT object_type, object_id, last_modified_by_device_id, updated_at, deleted_at, sync_dirty
       FROM sync_object_state WHERE object_type = 'node_review' AND object_id = ?`
    )
    .get(NODE_ID) as Record<string, unknown> | undefined;
}

function selectReviewChangeLogRow() {
  const connection = openDatabaseConnection();
  return connection.sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM sync_change_log WHERE object_type = 'node_review' AND object_id = ?`
    )
    .get(NODE_ID) as { count: number };
}

it('writes node_review and review_log in one grading mutation', () => {
  seedQaNode();
  applyReviewGrade(GRADE_INPUT);
  const reviewRow = selectReviewRow();
  const logRow = selectReviewLogRow();

  expect(reviewRow).toMatchObject({
    due: '2026-03-10T00:00:00.000Z',
    last_review_at: '2026-03-06T00:00:00.000Z',
    state: 1,
    stability: 2.5,
    difficulty: 3.1,
    elapsed_days: 1,
    scheduled_days: 4,
    reps: 1,
    lapses: 0
  });
  expect(logRow).toMatchObject({
    node_id: NODE_ID,
    grade: 3,
    scheduler_version: getReviewSchedulerVersion(DEFAULT_REVIEW_SCHEDULER_SETTINGS),
    reviewed_at: '2026-03-06T00:00:00.000Z',
    due_before: '2026-03-06T00:00:00.000Z',
    due_after: '2026-03-10T00:00:00.000Z',
    stability_before: 0,
    stability_after: 2.5
  });
});

it('writes sync state for review grading without generic change log rows', () => {
  seedQaNode();
  applyReviewGrade(GRADE_INPUT);

  const state = selectSyncObjectState();
  const change = selectReviewChangeLogRow();

  expect(state).toMatchObject({
    object_type: 'node_review',
    object_id: NODE_ID,
    updated_at: '2026-03-06T00:00:00.000Z',
    deleted_at: null,
    sync_dirty: 1
  });
  expect(String(state?.last_modified_by_device_id)).toMatch(/^desktop-/);
  expect(change.count).toBe(0);
});

it('tombstones review sync state when review state is reset', () => {
  seedQaNode();
  applyReviewGrade(GRADE_INPUT);
  resetNodeReviewState(NODE_ID);

  const state = selectSyncObjectState();

  expect(selectReviewRow()).toBeUndefined();
  expect(state).toMatchObject({
    object_type: 'node_review',
    object_id: NODE_ID,
    sync_dirty: 1
  });
  expect(typeof state?.deleted_at).toBe('string');
  expect(selectReviewChangeLogRow().count).toBe(0);
});
