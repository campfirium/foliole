import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../lib/core/sync/framedSyncContract';
import { createEmptyResourceStages,
  createSkippedResourceSummary } from '../../companionDesktopSyncResourceStages';
import type {
  CompanionDesktopSyncOptions,
  CompanionDesktopSyncResult
} from '../../companionDesktopSyncTypes';

import { runCompanionRequestSyncDatabaseRound } from './framed/companionRequestSyncDatabaseRound.js';
import { requireCompanionRequestSyncPeerState } from './framed/companionRequestSyncPeerState.js';
import { continueCompanionRequestSyncResources } from './framed/companionRequestSyncResources.js';
import { loadCompanionSyncGroupMemberState } from './syncGroupMemberStateStore.js';
import { loadCompanionSyncGroup } from './syncGroupStore';

/** Request-scoped database exchange; attachment transfer is an independent stage. */
export async function syncCompanionIdentityObjects(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions
): Promise<CompanionDesktopSyncResult> {
  if (options.framedPeer?.protocolVersion !== FRAMED_SYNC_PROTOCOL_VERSION) {
    throw new Error('framed_sync_peer_required');
  }
  const startedAt = Date.now();
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  const local = await loadCompanionSyncGroupMemberState();
  const peerState = requireCompanionRequestSyncPeerState(group.group_id, options.framedPeer.deviceId, options.framedPeer.libraryEpoch);
  const round = options.resourcesOnly && !options.restoreId ? { pending: 0, received: [], sent: [] } : await runCompanionRequestSyncDatabaseRound({ endpointUrl, groupId: group.group_id,
    localLibraryEpoch: local.library_epoch, peerState,
    ...(options.restoreId ? { restoreId: options.restoreId } : {}),
    reportObjectError: (difference, error) => console.error('[request-sync] object rejected', {
      objectId: difference.globalId, objectType: difference.objectType,
      sourceDeviceId: difference.direction === 'local_to_remote' ? group.local_device_identity_key : peerState.sender_device_identity_key,
      error: error instanceof Error ? error.message : String(error)
    }) });
  await options.onStructureSynced?.();
  const resources = await continueCompanionRequestSyncResources({ endpoint_url: endpointUrl,
    sync_group_id: group.group_id, receiver_device_id: options.framedPeer.deviceId,
    receiver_library_epoch: options.framedPeer.libraryEpoch });
  const receivedIds = round.received;
  const sentIds = round.sent;
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
    remainingAttachmentResourceCount: resources.pending + resources.unavailable,
    localDirtyCount: round.pending,
    pushConflictCount: 0,
    pushError: null,
    pushRejectedCount: 0,
    remainingStructureChangeCount: round.pending,
    syncedStructureElapsedMs: Date.now() - startedAt
  };
}
