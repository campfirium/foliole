import {
  applyCompanionSyncPush,
  type CompanionSyncPushPayload,
  type CompanionSyncPushResult
} from './companionSyncPushApply.js';
import { applyNodeVersionPushAsync } from './companionSyncPushNodeVersionApply.js';

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
    const itemResult = item.identity.objectType === 'node'
      ? await applyNodeVersionPushAsync(item)
      : applyCompanionSyncPush([item]);
    appendPushResult(result, itemResult);
  }
  return result;
}
