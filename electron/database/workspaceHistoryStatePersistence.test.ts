// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-history-state-tests';

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
import { saveNodeReadingState } from './nodeReadingState.js';
import { saveNodeReviewState } from './nodeReviewState.js';
import { applyReviewGrade } from './reviewMutations.js';

const NODE_ID = 'workspace-history-node';
const BUSINESS_BEFORE = '2026-08-01T00:00:00.000Z';
const BUSINESS_AFTER = '2026-08-02T00:00:00.000Z';
const UNDO_MUTATION_AT = '2026-08-03T00:00:00.000Z';
const REDO_MUTATION_AT = '2026-08-04T00:00:00.000Z';
let tempRoot = '';

const beforeReview = {
  difficulty: 0, due: BUSINESS_BEFORE, elapsedDays: 0, lapses: 0, lastReviewAt: null,
  reps: 0, scheduledDays: 0, stability: 0, state: 0 as const
};
const afterReview = {
  difficulty: 3.1, due: '2026-08-09T00:00:00.000Z', elapsedDays: 1, lapses: 0,
  lastReviewAt: BUSINESS_AFTER, reps: 1, scheduledDays: 7, stability: 2.5, state: 1 as const
};
const beforeReading = {
  intervalDurationMs: 86_400_000, intervalGrowthFactor: 1.3, lastHandledAt: BUSINESS_BEFORE,
  nextAt: BUSINESS_AFTER, priority: 3, readingPosition: 0.25, repetitionCount: 1, state: 'active' as const
};
const afterReading = { ...beforeReading, lastHandledAt: BUSINESS_AFTER, state: 'dismissed' as const };

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-history-state-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  upsertNodeSnapshot({
    anchorLink: null, content: 'Question', createdAt: BUSINESS_BEFORE, isTitleManual: true,
    kind: 'item', nodeId: NODE_ID, parentNodeId: null, position: 0, reveal: 'Answer',
    title: 'Workspace history', updatedAt: BUSINESS_BEFORE
  });
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('restores current reading and review facts with fresh mutation timestamps and preserves review_log', () => {
  saveNodeReadingState({ nodeId: NODE_ID, reading: afterReading, updatedAt: BUSINESS_AFTER });
  applyReviewGrade({
    cardAfter: toSchedulerCard(afterReview), cardBefore: toSchedulerCard(beforeReview), grade: 3,
    nodeId: NODE_ID, reviewedAt: BUSINESS_AFTER, schedulerVersion: 'history-test'
  });

  saveNodeReadingState({ nodeId: NODE_ID, reading: beforeReading, updatedAt: UNDO_MUTATION_AT });
  saveNodeReviewState({ nodeId: NODE_ID, review: beforeReview, updatedAt: UNDO_MUTATION_AT });
  expect(readCurrentFacts()).toMatchObject({
    reading_last_handled_at: BUSINESS_BEFORE,
    reading_sync_updated_at: UNDO_MUTATION_AT,
    review_due: BUSINESS_BEFORE,
    review_log_count: 1,
    review_sync_updated_at: UNDO_MUTATION_AT
  });

  saveNodeReadingState({ nodeId: NODE_ID, reading: afterReading, updatedAt: REDO_MUTATION_AT });
  saveNodeReviewState({ nodeId: NODE_ID, review: afterReview, updatedAt: REDO_MUTATION_AT });
  closeDatabaseConnection();
  initializeDatabase();
  expect(readCurrentFacts()).toMatchObject({
    reading_state: 'dismissed',
    reading_sync_updated_at: REDO_MUTATION_AT,
    review_due: afterReview.due,
    review_log_count: 1,
    review_sync_updated_at: REDO_MUTATION_AT
  });
});

function toSchedulerCard(review: typeof beforeReview | typeof afterReview) {
  return {
    difficulty: review.difficulty, due: review.due, elapsed_days: review.elapsedDays,
    lapses: review.lapses, last_review: review.lastReviewAt, reps: review.reps,
    scheduled_days: review.scheduledDays, stability: review.stability, state: review.state
  };
}

function readCurrentFacts() {
  return openDatabaseConnection().sqlite.prepare(`
    SELECT nr.last_handled_at AS reading_last_handled_at, nr.state AS reading_state,
      reading_sync.updated_at AS reading_sync_updated_at, review.due AS review_due,
      review_sync.updated_at AS review_sync_updated_at,
      (SELECT COUNT(*) FROM review_log WHERE node_id = ?) AS review_log_count
    FROM node_reading nr
    JOIN node_review review ON review.node_id = nr.node_id
    JOIN sync_object_state reading_sync
      ON reading_sync.object_type = 'node_reading' AND reading_sync.object_id = nr.node_id
    JOIN sync_object_state review_sync
      ON review_sync.object_type = 'node_review' AND review_sync.object_id = nr.node_id
    WHERE nr.node_id = ?
  `).get(NODE_ID, NODE_ID) as Record<string, unknown>;
}
