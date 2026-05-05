import type {
  CompanionSyncPushPayload,
  CompanionSyncPushResult
} from './companionSyncPushApply.js';
import { applyNodeVersionPushAsync } from './companionSyncPushNodeVersionApply.js';
import { applyReviewLogPushAsync } from './companionSyncPushReviewLogApply.js';
import {
  applyStateObjectPushAsync,
  isStateObjectPush
} from './companionSyncPushStateObjectAsyncApply.js';

export type { CompanionSyncPushPayload } from './companionSyncPushApply.js';

function emptyPushResult(): CompanionSyncPushResult {
  return { acks: [], appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] };
}

function appendPushResult(target: CompanionSyncPushResult, item: CompanionSyncPushResult) {
  target.acks.push(...item.acks);
  target.appliedNodeIds.push(...item.appliedNodeIds);
  target.appliedObjectIds.push(...item.appliedObjectIds);
  target.appliedReviewOpIds.push(...item.appliedReviewOpIds);
}

export async function applyCompanionSyncPushAsync(
  items: CompanionSyncPushPayload[]
): Promise<CompanionSyncPushResult> {
  const result = emptyPushResult();
  for (const item of items) {
    const itemResult = await applySinglePushItemAsync(item);
    appendPushResult(result, itemResult);
  }
  return result;
}

async function applySinglePushItemAsync(item: CompanionSyncPushPayload) {
  if (item.identity.objectType === 'node') return await applyNodeVersionPushAsync(item);
  if (isStateObjectPush(item)) return await applyStateObjectPushAsync(item);
  if (item.identity.objectType === 'review_log') return await applyReviewLogPushAsync(item);
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
  } satisfies CompanionSyncPushResult;
}
