import { randomUUID } from 'node:crypto';

import type { DatabaseDriver } from './driver.js';
import { appendSyncChangeLog, computeSyncContentHash, upsertSyncObjectState } from './syncState.js';

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
  appendSyncChangeLog(driver, {
    changeId: context.opId,
    objectType: 'node_review',
    objectId: nodeId,
    changeType: 'upsert',
    deviceId: context.deviceId,
    contentHash,
    payloadJson: JSON.stringify({ logId: context.logId, nodeId, opId: context.opId, review: payload }),
    createdAt: context.reviewedAt,
    appliedAt: context.reviewedAt
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
  appendSyncChangeLog(driver, {
    changeId: randomUUID(),
    objectType: 'node_review',
    objectId: nodeId,
    changeType: 'delete',
    deviceId: context.deviceId,
    contentHash,
    payloadJson: JSON.stringify({ nodeId }),
    createdAt: context.deletedAt,
    appliedAt: context.deletedAt
  });
}
