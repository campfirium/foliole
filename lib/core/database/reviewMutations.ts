import type { DatabaseDriver } from './driver.js';
import { INSERT_REVIEW_EVENT_SQL } from './reviewLogRecord.js';
import { recomputeNodeReview } from './reviewProjection.js';
import { readStoredReviewCard } from './storedReviewCard.js';

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

export function applyReviewGrade(
  driver: DatabaseDriver,
  input: ApplyReviewGradeInput,
  context: ReviewMutationContext
) {
  const insertReviewLogStatement = driver.prepare(INSERT_REVIEW_EVENT_SQL);
  const opId = input.opId ?? context.createId();
  return driver.transaction(() => {
    const existing = driver.queryOne<{ node_id: string; grade: number; reviewed_at: string; scheduler_version: string }>(
      'SELECT node_id, grade, reviewed_at, scheduler_version FROM review_log WHERE op_id = ?', [opId]);
    if (existing) {
      if (existing.node_id !== input.nodeId || existing.grade !== input.grade || existing.reviewed_at !== input.reviewedAt
        || existing.scheduler_version !== input.schedulerVersion) throw new Error('review_op_mismatch');
      return readStoredReviewCard(driver, input.nodeId);
    }
    const logId = context.createId();
    insertReviewLogStatement.run(toReviewLogParams(input, context, opId, logId));
    return recomputeNodeReview(driver, input.nodeId);
  });
}

export function resetNodeReviewState(
  driver: DatabaseDriver,
  nodeId: string,
  context: { deletedAt: string; hostName: string }
): void {
  driver.transaction(() => {
    const opId = `reset:${context.hostName}:${nodeId}:${context.deletedAt}`;
    if (driver.queryOne('SELECT 1 FROM review_log WHERE op_id = ?', [opId])) return;
    driver.prepare(`UPDATE nodes SET shelved_at = NULL, updated_at = ?,
      last_modified_by_host_name = ?, sync_dirty = 1
      WHERE id = ? AND shelved_at IS NOT NULL`).run([context.deletedAt, context.hostName, nodeId]);
    driver.prepare(INSERT_REVIEW_EVENT_SQL).run([
      opId, opId, context.hostName, nodeId, 0, '', context.deletedAt, 'reset', null
    ]);
    recomputeNodeReview(driver, nodeId);
  });
}
