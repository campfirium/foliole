import type { DatabaseDriver } from './driver.js';
import { computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

export interface NodeReviewSyncPayload {
  due: string;
  lastReviewAt: string;
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

function toNodeReviewHash(nodeId: string, payload: NodeReviewSyncPayload) {
  return computeSyncContentHash('node_review', { nodeId, ...payload });
}

function toNodeReviewTombstoneHash(nodeId: string, deletedAt: string) {
  return computeSyncContentHash('node_review', {
    deletedAt,
    nodeId,
    objectType: 'node_review'
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
