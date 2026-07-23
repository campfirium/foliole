import type { DatabaseBindParams, DatabaseDriver } from './driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

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

export interface NodeReviewSyncContext {
  deviceId: string;
  logId: string;
  opId: string;
  reviewedAt: string;
}

export interface NodeReviewResetContext {
  deviceId: string;
  deletedAt: string;
}

export interface WriteNodeReviewSyncInput {
  nodeId: string;
  deviceId?: string;
  review?: NodeReviewSyncPayload | null;
  updatedAt: string;
}

function toNodeReviewHash(nodeId: string, payload: NodeReviewSyncPayload) {
  return computeSyncContentHash('node_review', {
    difficulty: payload.difficulty,
    due: payload.due,
    elapsed_days: payload.elapsedDays,
    lapses: payload.lapses,
    last_review_at: payload.lastReviewAt,
    node_id: nodeId,
    reps: payload.reps,
    scheduled_days: payload.scheduledDays,
    stability: payload.stability,
    state: payload.state
  });
}

function toNodeReviewTombstoneHash(nodeId: string, deletedAt: string) {
  return computeSyncContentHash('node_review', {
    deleted_at: deletedAt,
    node_id: nodeId,
    object_type: 'node_review'
  });
}

export function recordNodeReviewSyncState(
  driver: DatabaseDriver,
  nodeId: string,
  payload: NodeReviewSyncPayload,
  context: NodeReviewSyncContext
) {
  const contentHash = toNodeReviewHash(nodeId, payload);
  upsertSyncObjectState(driver, {
    objectType: 'node_review',
    objectId: nodeId,
    contentHash,
    lastModifiedByDeviceId: context.deviceId,
    updatedAt: context.reviewedAt,
    syncDirty: true
  });
}

export function recordNodeReviewTombstone(
  driver: DatabaseDriver,
  nodeId: string,
  context: NodeReviewResetContext
) {
  const contentHash = toNodeReviewTombstoneHash(nodeId, context.deletedAt);
  upsertSyncObjectState(driver, {
    objectType: 'node_review',
    objectId: nodeId,
    contentHash,
    deletedAt: context.deletedAt,
    lastModifiedByDeviceId: context.deviceId,
    updatedAt: context.deletedAt,
    syncDirty: true
  });
}

export function writeNodeReviewSnapshotWithSync(
  driver: DatabaseDriver,
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
  if (input.deviceId) {
    recordNodeReviewSyncState(driver, input.nodeId, input.review, {
      deviceId: input.deviceId,
      logId: '',
      opId: '',
      reviewedAt: input.updatedAt
    });
  }
}

export function saveNodeReviewStateWithSync(driver: DatabaseDriver, input: WriteNodeReviewSyncInput) {
  const upsertReview = driver.prepare(`INSERT OR REPLACE INTO node_review (
    node_id, due, last_review_at, state, stability, difficulty, elapsed_days, scheduled_days, reps, lapses
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  driver.transaction(() => writeNodeReviewSnapshotWithSync(driver, input, upsertReview.run));
}
