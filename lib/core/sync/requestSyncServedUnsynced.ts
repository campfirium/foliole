import type { FramedSyncInventoryEntry } from './framedSyncInventory.js';
import type { RequestSyncObjectResult } from './requestSyncBatchContract.js';
import type { RequestSyncDatabaseHost } from './requestSyncObjectEndpoint.js';
import { isRequestSyncObjectFailure } from './requestSyncObjectFailure.js';
import type { RequestSyncAuthenticatedContext } from './requestSyncWire.js';
import { syncUnsyncedCode, syncUnsyncedIdentity, updateSyncUnsyncedItems } from './syncUnsyncedItems.js';

/**
 * A device that only answers never compares inventories, so it records what it could not apply or send,
 * and drops an item once it handles that item successfully.
 */
export async function recordRequestSyncServed(host: RequestSyncDatabaseHost, context: RequestSyncAuthenticatedContext,
  results: readonly RequestSyncObjectResult[], source: 'initiator' | 'responder') {
  const handled = new Set(results.filter(result => !result.error).map(syncUnsyncedIdentity));
  const failed = results.filter(result => result.error && isRequestSyncObjectFailure(result.error)).map(result => {
    const stage = result.failureStage ?? 'apply';
    // The source prepares: this device when it is sending, otherwise the requester.
    const selfFailed = (source === 'responder') === (stage === 'prepare');
    return { objectType: result.objectType, globalId: result.globalId, code: syncUnsyncedCode(result.error),
      side: selfFailed ? 'self' as const : 'peer' as const, stage };
  });
  if (await updateSyncUnsyncedItems(host, context.initiatorDeviceId,
    { failed, keep: item => !handled.has(syncUnsyncedIdentity(item)) })) host.unsyncedRecordChanged?.();
}

/** A full inventory also shows what this device holds but cannot send yet. */
export async function recordRequestSyncUnready(host: RequestSyncDatabaseHost, context: RequestSyncAuthenticatedContext,
  entries: readonly FramedSyncInventoryEntry[]) {
  const failed = entries.filter(entry => entry.unready).map(entry => ({ objectType: entry.objectType,
    globalId: entry.globalId, code: 'sync_item_unready', side: 'self' as const, stage: 'inventory' as const }));
  if (await updateSyncUnsyncedItems(host, context.initiatorDeviceId,
    { failed, keep: item => item.stage !== 'inventory' })) host.unsyncedRecordChanged?.();
}
