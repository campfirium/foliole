import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';
import type { RequestSyncObjectFailureStage } from './requestSyncBatchContract.js';
import type { RequestSyncInventoryAnalysis } from './requestSyncInventoryAnalysis.js';
import { syncUnsyncedCode, syncUnsyncedIdentity, type SyncUnsyncedFailure, type SyncUnsyncedUpdate } from './syncUnsyncedItems.js';

/** Objects held back in this round, keyed by direction and identity. */
export type RequestSyncRejections = Map<string, SyncUnsyncedFailure>;

export function requestSyncRejection(difference: FramedSyncInventoryDifference, error: string,
  stage: RequestSyncObjectFailureStage = 'apply'): SyncUnsyncedFailure {
  // The source prepares and the destination applies; direction tells which of them is this device.
  const selfFailed = (difference.direction === 'local_to_remote') === (stage === 'prepare');
  return { objectType: difference.objectType, globalId: difference.globalId, code: syncUnsyncedCode(error),
    side: selfFailed ? 'self' : 'peer', stage };
}

export function requestSyncDependencyRejection(difference: FramedSyncInventoryDifference): SyncUnsyncedFailure {
  return { objectType: difference.objectType, globalId: difference.globalId, code: 'sync_item_waiting_parent',
    side: difference.direction === 'local_to_remote' ? 'peer' : 'self', stage: 'dependency' };
}

/** What the last comparison still shows as unsynced. Items it no longer differs on are resolved. */
export function requestSyncRoundUnsynced(analysis: RequestSyncInventoryAnalysis,
  rejected: RequestSyncRejections): SyncUnsyncedUpdate {
  const different = new Set(analysis.differences.map(syncUnsyncedIdentity));
  const failed = new Map<string, SyncUnsyncedFailure>();
  for (const [identity, entry] of analysis.unready) {
    failed.set(identity, { objectType: entry.objectType, globalId: entry.globalId, code: 'sync_item_unready',
      side: entry.side === 'local' ? 'self' : 'peer', stage: 'inventory' });
  }
  for (const failure of rejected.values()) {
    const identity = syncUnsyncedIdentity(failure);
    if (different.has(identity)) failed.set(identity, failure);
  }
  return { failed: [...failed.values()], keep: item => different.has(syncUnsyncedIdentity(item)) };
}
