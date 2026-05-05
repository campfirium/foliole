import { randomUUID } from 'node:crypto';

import { getReviewSchedulerVersion, loadReviewSchedulerSettings } from '../reviewSchedulerSettings.js';

import { openDatabaseConnection } from './connection.js';
import { withTransaction } from './transaction.js';

interface ReviewCardSnapshot {
  due: string;
  last_review: string | null;
  state: 0 | 1 | 2 | 3;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
}

export interface ApplyReviewGradeInput {
  nodeId: string;
  grade: 1 | 2 | 3 | 4;
  reviewedAt: string;
  cardBefore: ReviewCardSnapshot;
  cardAfter: ReviewCardSnapshot;
}

const REVIEW_DEVICE_ID = 'desktop-local';
const UPSERT_NODE_REVIEW_SQL = `INSERT INTO node_review (
  node_id,
  due,
  last_review_at,
  state,
  stability,
  difficulty,
  elapsed_days,
  scheduled_days,
  reps,
  lapses
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(node_id) DO UPDATE SET
  due = excluded.due,
  last_review_at = excluded.last_review_at,
  state = excluded.state,
  stability = excluded.stability,
  difficulty = excluded.difficulty,
  elapsed_days = excluded.elapsed_days,
  scheduled_days = excluded.scheduled_days,
  reps = excluded.reps,
  lapses = excluded.lapses`;
const INSERT_REVIEW_LOG_SQL = `INSERT INTO review_log (
  id,
  op_id,
  device_id,
  node_id,
  grade,
  scheduler_version,
  reviewed_at,
  due_before,
  stability_before,
  difficulty_before,
  due_after,
  stability_after,
  difficulty_after
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function toNodeReviewParams(input: ApplyReviewGradeInput) {
  return [
    input.nodeId,
    input.cardAfter.due,
    input.reviewedAt,
    input.cardAfter.state,
    input.cardAfter.stability,
    input.cardAfter.difficulty,
    input.cardAfter.elapsed_days,
    input.cardAfter.scheduled_days,
    input.cardAfter.reps,
    input.cardAfter.lapses
  ];
}

function toReviewLogParams(input: ApplyReviewGradeInput, opId: string, logId: string) {
  const schedulerVersion = getReviewSchedulerVersion(loadReviewSchedulerSettings());
  return [
    logId,
    opId,
    REVIEW_DEVICE_ID,
    input.nodeId,
    input.grade,
    schedulerVersion,
    input.reviewedAt,
    input.cardBefore.due,
    input.cardBefore.stability,
    input.cardBefore.difficulty,
    input.cardAfter.due,
    input.cardAfter.stability,
    input.cardAfter.difficulty
  ];
}

export function applyReviewGrade(input: ApplyReviewGradeInput): void {
  const connection = openDatabaseConnection();
  const upsertNodeReviewStatement = connection.sqlite.prepare(UPSERT_NODE_REVIEW_SQL);
  const insertReviewLogStatement = connection.sqlite.prepare(INSERT_REVIEW_LOG_SQL);
  const opId = randomUUID();
  const logId = randomUUID();
  withTransaction(connection.sqlite, () => {
    upsertNodeReviewStatement.run(...toNodeReviewParams(input));
    insertReviewLogStatement.run(...toReviewLogParams(input, opId, logId));
  });
}
