import type { DbPort } from '../../lib/core/sync/dbPort.js';

import { applyNodePushBatchWithDbPort } from './companionSyncNodeConvergence.js';
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
  items: CompanionSyncPushPayload[],
  sourceDeviceId: string
): Promise<CompanionSyncPushResult> {
  return port.transaction(async (tx) => {
    const result = emptyPushResult();
    const nodeItems = items.filter((item) => item.identity.objectType === 'node');
    if (nodeItems.length > 0) {
      appendPushResult(result, await applyNodePushBatchWithDbPort(tx, nodeItems, sourceDeviceId));
    }
    for (const item of items.filter((candidate) => candidate.identity.objectType !== 'node')) {
      const itemResult = isStateObjectPush(item)
        ? await applyStateObjectPushWithDbPort(
          tx, item, item.identity.objectType as StatePushObjectType, sourceDeviceId
        )
        : item.identity.objectType === 'review_log'
          ? await applyReviewLogPushWithDbPort(tx, item, sourceDeviceId)
          : unsupportedPushResult(item);
      appendPushResult(result, itemResult);
    }
    return result;
  });
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
