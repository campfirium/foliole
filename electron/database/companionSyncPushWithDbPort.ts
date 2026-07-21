import type { DbPort } from '../../lib/core/sync/dbPort.js';

import { applyNodeVersionPushWithDbPort } from './companionSyncPushNodeVersionWithDbPort.js';
import { applyReviewLogPushWithDbPort } from './companionSyncPushReviewLogWithDbPort.js';
import {
  applyStateObjectPushWithDbPort,
  isStateObjectPush,
  type StatePushObjectType
} from './companionSyncPushStateObjectWithDbPort.js';
import type {
  CompanionSyncPushPayload,
  CompanionSyncPushResult
} from './companionSyncPushTypes.js';

function emptyPushResult(): CompanionSyncPushResult {
  return { acks: [], appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] };
}

function appendPushResult(target: CompanionSyncPushResult, item: CompanionSyncPushResult) {
  target.acks.push(...item.acks);
  target.appliedNodeIds.push(...item.appliedNodeIds);
  target.appliedObjectIds.push(...item.appliedObjectIds);
  target.appliedReviewOpIds.push(...item.appliedReviewOpIds);
}

export async function applyCompanionStateSyncPushWithDbPort(
  port: DbPort,
  items: CompanionSyncPushPayload[]
): Promise<CompanionSyncPushResult> {
  const result = emptyPushResult();
  for (const item of items) {
    const itemResult = item.identity.objectType === 'node'
      ? await applyNodeVersionPushWithDbPort(port, item)
      : isStateObjectPush(item)
      ? await applyStateObjectPushWithDbPort(port, item, item.identity.objectType as StatePushObjectType)
      : item.identity.objectType === 'review_log'
        ? await applyReviewLogPushWithDbPort(port, item)
        : unsupportedPushResult(item);
    appendPushResult(result, itemResult);
  }
  return result;
}

function unsupportedPushResult(item: CompanionSyncPushPayload): CompanionSyncPushResult {
  return {
    acks: [{
      clientOpId: item.clientOpId,
      conflictReason: 'unsupported_object_type',
      identity: item.identity,
      status: 'rejected'
    }],
    appliedNodeIds: [],
    appliedObjectIds: [],
    appliedReviewOpIds: []
  };
}
