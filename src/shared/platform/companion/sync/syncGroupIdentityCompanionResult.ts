import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../lib/core/sync/framedSyncContract';
import { createEmptyResourceStages,
  createSkippedResourceSummary } from '../../companionDesktopSyncResourceStages';
import type {
  CompanionDesktopSyncOptions,
  CompanionDesktopSyncResult
} from '../../companionDesktopSyncTypes';

import { sendCompanionFramedSyncInventoryDifferences } from './framed/companionFramedSyncInventoryRound';
import { loadCompanionSyncGroup } from './syncGroupStore';

/** Run the only supported companion data plane: framed Sync v22. */
export async function syncCompanionIdentityObjects(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions
): Promise<CompanionDesktopSyncResult> {
  if (options.resourcesOnly) throw new Error('framed_sync_resources_are_in_band');
  if (options.framedPeer?.protocolVersion !== FRAMED_SYNC_PROTOCOL_VERSION) {
    throw new Error('framed_sync_peer_required');
  }
  const startedAt = Date.now();
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  const round = await sendCompanionFramedSyncInventoryDifferences({
    endpoint_url: endpointUrl,
    receiver_device_id: options.framedPeer.deviceId,
    receiver_library_epoch: options.framedPeer.libraryEpoch,
    sync_group_id: group.group_id
  });
  await options.onStructureSynced?.();
  const receivedIds = round.received.map((value) => value.objectId);
  const sentIds = round.sent.map((value) => value.objectId);
  return {
    appliedNodeIds: receivedIds,
    appliedObjectIds: receivedIds,
    appliedPackBlobCount: 0,
    appliedPackObjectCount: receivedIds.length,
    appliedReviewOpIds: [],
    changedObjectIds: receivedIds,
    pushedNodeIds: sentIds,
    pushedObjectIds: sentIds,
    pushedReviewOpIds: [],
    requestedObjectIds: receivedIds,
    ...createSkippedResourceSummary(),
    ...createEmptyResourceStages(),
    localDirtyCount: round.deferredObjects.length,
    pushConflictCount: 0,
    pushError: null,
    pushRejectedCount: 0,
    remainingStructureChangeCount: round.deferredObjects.length,
    syncedStructureElapsedMs: Date.now() - startedAt
  };
}
