import type { DatabaseDriver } from './driver.js';
import { recordNodeReviewSyncState, recordNodeReviewTombstone } from './nodeReviewSyncState.js';
import { INSERT_REVIEW_EVENT_SQL } from './reviewLogRecord.js';

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
  opId?: string;
  nodeId: string;
  grade: 1 | 2 | 3 | 4;
  reviewedAt: string;
  schedulerVersion: string;
  cardBefore: ReviewCardSnapshot;
  cardAfter: ReviewCardSnapshot;
}

export interface ReviewMutationContext {
  hostName: string;
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
    context.hostName,
    input.nodeId,
    input.grade,
    input.schedulerVersion,
    input.reviewedAt,
    'review',
    null
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
  const insertReviewLogStatement = driver.prepare(INSERT_REVIEW_EVENT_SQL);
  const opId = input.opId ?? context.createId();
  const logId = context.createId();

  driver.transaction(() => {
    upsertNodeReviewStatement.run(toNodeReviewParams(input));
    insertReviewLogStatement.run(toReviewLogParams(input, context, opId, logId));
    recordNodeReviewSyncState(driver, input.nodeId, toNodeReviewSyncPayload(input), {
      hostName: context.hostName,
      logId,
      opId,
      reviewedAt: input.reviewedAt
    });
  });
}

export function resetNodeReviewState(
  driver: DatabaseDriver,
  nodeId: string,
  context: { deletedAt: string; hostName: string }
): void {
  driver.transaction(() => {
    driver.prepare('DELETE FROM node_review WHERE node_id = ?').run([nodeId]);
    recordNodeReviewTombstone(driver, nodeId, context);
    const opId = `reset:${context.hostName}:${nodeId}:${context.deletedAt}`;
    driver.prepare(INSERT_REVIEW_EVENT_SQL).run([
      opId, opId, context.hostName, nodeId, 0, '', context.deletedAt, 'reset', null
    ]);
  });
}
