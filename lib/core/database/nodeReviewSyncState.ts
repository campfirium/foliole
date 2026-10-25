import { reviewHistoryOpId, type ReviewHistoryMutation } from '../review/reviewEventIdentity.js';

import type { DatabaseBindParams, DatabaseDriver } from './driver.js';
import { recordReviewHistory } from './reviewLogRecord.js';
import { recomputeNodeReview } from './reviewProjection.js';
import { readStoredReviewCard } from './storedReviewCard.js';

export interface NodeReviewSyncPayload {
  due: string;
  lastReviewAt: string | null;
  state: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
}

export interface WriteNodeReviewSyncInput {
  nodeId: string;
  hostName?: string;
  review?: NodeReviewSyncPayload | null;
  updatedAt: string;
  history?: ReviewHistoryMutation;
}

function writeNodeReviewSnapshot(
  input: WriteNodeReviewSyncInput,
  upsertReview: (params?: DatabaseBindParams) => void
) {
  if (!input.review) {
    return;
  }
  upsertReview([
    input.nodeId,
    input.review.due,
    input.review.lastReviewAt,
    input.review.state,
    input.review.stability,
    input.review.difficulty,
    input.review.elapsedDays,
    input.review.scheduledDays,
    input.review.reps,
    input.review.lapses
  ]);
}

export function saveNodeReviewStateWithSync(driver: DatabaseDriver, input: WriteNodeReviewSyncInput) {
  const upsertReview = driver.prepare(`INSERT OR REPLACE INTO node_review (
    node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  return driver.transaction(() => {
    if (!input.history && input.review) writeNodeReviewSnapshot(input, upsertReview.run);
    else if (!input.history) {
      driver.prepare('DELETE FROM node_review WHERE node_id = ?').run([input.nodeId]);
    }
    const inserted = input.history && input.hostName && recordReviewHistory(driver, {
      nodeId: input.nodeId, history: input.history, hostName: input.hostName,
      updatedAt: input.updatedAt, opId: reviewHistoryOpId(input.history.targetOpId, input.updatedAt, input.history.mode)
    });
    return inserted ? recomputeNodeReview(driver, input.nodeId) : readStoredReviewCard(driver, input.nodeId);
  });
}
