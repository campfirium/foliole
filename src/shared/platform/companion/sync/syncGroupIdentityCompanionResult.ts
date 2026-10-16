import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../lib/core/sync/framedSyncContract';
import type { RequestSyncPeerRound } from '../../../../../lib/core/sync/requestSyncPeerRound.js';
import { CURRENT_SYNC_PROTOCOL_DESCRIPTOR } from '../../../../../lib/platform/syncProtocolContract';
import type {
  CompanionDesktopSyncOptions,
  CompanionDesktopSyncResult
} from '../../companionDesktopSyncTypes';

import { createEmptyResourceStages,
  createSkippedResourceSummary } from './companionSyncResourceSummary';
import { runCompanionRequestSyncDatabaseRound } from './framed/companionRequestSyncDatabaseRound.js';
import { requireCompanionRequestSyncPeerState } from './framed/companionRequestSyncPeerState.js';
import { continueCompanionRequestSyncResources } from './framed/companionRequestSyncResources.js';
import { withCompanionSyncPeerRound, withCompanionRequestSyncPeerRound } from './framed/companionSyncPeerRounds.js';
import { loadCompanionSyncGroupMemberState } from './syncGroupMemberStateStore.js';
import { loadCompanionSyncGroup } from './syncGroupStore';
import { updateIosCompanionWorkspaceSyncMetadata } from './workspace-state/iosCompanionWorkspaceSyncStateStore';

/** Request-scoped database exchange; attachment transfer is an independent stage. */
export async function syncCompanionIdentityObjects(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions
): Promise<CompanionDesktopSyncResult> {
  if (options.framedPeer?.protocolVersion !== CURRENT_SYNC_PROTOCOL_DESCRIPTOR.version) {
    throw new Error('framed_sync_peer_required');
  }
  return withCompanionSyncPeerRound(options.framedPeer.deviceId,
    (peerRound, signal) => syncObjectsInRound(endpointUrl, options, peerRound, signal), {
      waitForInbound: () => options.waitForInbound?.() === true,
      ...(options.signal ? { signal: options.signal } : {}),
      onWaiting: waiting => options.onProgress?.({ completed: 0, total: null,
        phase: waiting ? 'waiting' : 'structure' })
    });
}

async function syncObjectsInRound(endpointUrl: string, options: CompanionDesktopSyncOptions,
  peerRound: RequestSyncPeerRound, signal: AbortSignal): Promise<CompanionDesktopSyncResult> {
  if (!options.framedPeer) throw new Error('framed_sync_peer_required');
  const framedPeer = options.framedPeer;
  const startedAt = Date.now();
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  const local = await loadCompanionSyncGroupMemberState();
  const peerState = requireCompanionRequestSyncPeerState(group.group_id, options.framedPeer.deviceId, options.framedPeer.libraryEpoch);
  const context = { groupId: group.group_id, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: group.local_device_identity_key, initiatorLibraryEpoch: local.library_epoch,
    responderDeviceId: options.framedPeer.deviceId, responderLibraryEpoch: options.framedPeer.libraryEpoch } as const;
  return withCompanionRequestSyncPeerRound(context, endpointUrl, peerRound, async () => {
  const round = options.resourcesOnly && !options.restoreId ? { pending: 0, received: [], sent: [], madeProgress: false, workspaceChanged: false } : await runCompanionRequestSyncDatabaseRound({ endpointUrl, groupId: group.group_id,
    peerRound, signal,
    localLibraryEpoch: local.library_epoch, peerState,
    ...(options.restoreId ? { restoreId: options.restoreId } : {}),
    reportObjectError: (difference, error) => console.error('[request-sync] object rejected', {
      objectId: difference.globalId, objectType: difference.objectType,
      sourceDeviceId: difference.direction === 'local_to_remote' ? group.local_device_identity_key : peerState.sender_device_identity_key,
      error: error instanceof Error ? error.message : String(error)
    }) });
  const syncedStructureElapsedMs = Date.now() - startedAt;
  const databaseConfirmedAt = (!options.resourcesOnly || options.restoreId) && round.pending === 0 ? new Date().toISOString() : undefined;
  const sessionConfirmationPending = await confirmDatabase(options, databaseConfirmedAt);
  const syncMetadataUnavailable = await persistConfirmedSyncTime(databaseConfirmedAt);
  await options.onStructureSynced?.({ receivedCount: round.received.length, workspaceChanged: round.workspaceChanged });
  const resourcesStartedAt = Date.now();
  const resources = round.pending > 0
    ? { pending: null, transferred: 0, blocks: 0, yielded: true, error: null }
    : await runAttachmentStage({ endpoint_url: endpointUrl,
    peerRound, signal,
    sync_group_id: group.group_id, receiver_device_id: framedPeer.deviceId,
    receiver_library_epoch: framedPeer.libraryEpoch });
  return {
    ...(databaseConfirmedAt ? { databaseConfirmedAt } : {}),
    syncMetadataUnavailable,
    ...(sessionConfirmationPending ? { sessionConfirmationPending: true } : {}),
    ...databaseResult(round),
    ...createSkippedResourceSummary(),
    ...createEmptyResourceStages(),
    // Bodies commit with their database objects; no separate body download stage remains.
    remainingAttachmentResourceCount: resources.pending,
    ...(resources.transferred === undefined ? {} : { transferredAttachmentCount: resources.transferred }),
    transferredAttachmentBlockCount: resources.blocks ?? 0,
    attachmentWorkYielded: resources.yielded,
    attachmentResourceError: resources.error,
    localDirtyCount: round.pending,
    pushConflictCount: 0,
    pushError: null,
    pushRejectedCount: 0,
    remainingStructureChangeCount: round.pending,
    syncedAttachmentResourceElapsedMs: Date.now() - resourcesStartedAt,
    syncedStructureElapsedMs
  };
  });
}

async function confirmDatabase(options: CompanionDesktopSyncOptions, confirmedAt: string | undefined) {
  if (!confirmedAt || !options.onDatabaseConfirmed) return false;
  try {
    await options.onDatabaseConfirmed(confirmedAt);
    return false;
  } catch {
    return true;
  }
}

async function persistConfirmedSyncTime(confirmedAt: string | undefined) {
  if (!confirmedAt) return false;
  try {
    await updateIosCompanionWorkspaceSyncMetadata(() => ({ last_synced_at: confirmedAt }));
    return false;
  } catch {
    return true;
  }
}

function databaseResult(round: Pick<Awaited<ReturnType<typeof runCompanionRequestSyncDatabaseRound>>, 'received' | 'sent' | 'madeProgress'>) {
  return {
    madeDatabaseProgress: round.madeProgress,
    appliedNodeIds: round.received,
    appliedObjectIds: round.received,
    appliedPackBlobCount: 0,
    appliedPackObjectCount: round.received.length,
    appliedReviewOpIds: [],
    changedObjectIds: round.received,
    pushedNodeIds: round.sent,
    pushedObjectIds: round.sent,
    pushedReviewOpIds: [],
    requestedObjectIds: round.received
  };
}

async function runAttachmentStage(input: Parameters<typeof continueCompanionRequestSyncResources>[0]) {
  try {
    return { ...await continueCompanionRequestSyncResources(input), error: null };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return { pending: null, transferred: undefined, blocks: 0, yielded: false,
      error: error instanceof Error ? error.message : String(error) };
  }
}
