import type { DatabaseDriver } from './driver.js';
import { recordNodeReviewSyncState, recordNodeReviewTombstone } from './nodeReviewSyncState.js';

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
  schedulerVersion: string;
  cardBefore: ReviewCardSnapshot;
  cardAfter: ReviewCardSnapshot;
}

export interface ReviewMutationContext {
  deviceId: string;
  createId: () => string;
}

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
  ] as const;
}

function toReviewLogParams(input: ApplyReviewGradeInput, context: ReviewMutationContext, opId: string, logId: string) {
  return [
    logId,
    opId,
    context.deviceId,
    input.nodeId,
    input.grade,
    input.schedulerVersion,
    input.reviewedAt,
    input.cardBefore.due,
    input.cardBefore.stability,
    input.cardBefore.difficulty,
    input.cardAfter.due,
    input.cardAfter.stability,
    input.cardAfter.difficulty
  ] as const;
}

function toNodeReviewSyncPayload(input: ApplyReviewGradeInput) {
  return {
    due: input.cardAfter.due,
    lastReviewAt: input.reviewedAt,
    state: input.cardAfter.state,
    stability: input.cardAfter.stability,
    difficulty: input.cardAfter.difficulty,
    elapsedDays: input.cardAfter.elapsed_days,
    scheduledDays: input.cardAfter.scheduled_days,
    reps: input.cardAfter.reps,
    lapses: input.cardAfter.lapses
  };
}

export function applyReviewGrade(
  driver: DatabaseDriver,
  input: ApplyReviewGradeInput,
  context: ReviewMutationContext
): void {
  const upsertNodeReviewStatement = driver.prepare(UPSERT_NODE_REVIEW_SQL);
  const insertReviewLogStatement = driver.prepare(INSERT_REVIEW_LOG_SQL);
  const opId = context.createId();
  const logId = context.createId();

  driver.transaction(() => {
    upsertNodeReviewStatement.run(toNodeReviewParams(input));
    insertReviewLogStatement.run(toReviewLogParams(input, context, opId, logId));
    recordNodeReviewSyncState(driver, input.nodeId, toNodeReviewSyncPayload(input), {
      deviceId: context.deviceId,
      logId,
      opId,
      reviewedAt: input.reviewedAt
    });
  });
}

export function resetNodeReviewState(
  driver: DatabaseDriver,
  nodeId: string,
  context?: { deletedAt: string; deviceId: string }
): void {
  driver.prepare('DELETE FROM node_review WHERE node_id = ?').run([nodeId]);
  if (context) {
    recordNodeReviewTombstone(driver, nodeId, context);
  }
}
