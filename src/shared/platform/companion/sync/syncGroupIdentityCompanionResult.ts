import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../lib/core/sync/framedSyncContract';
import { createEmptyResourceStages,
  createSkippedResourceSummary } from '../../companionDesktopSyncResourceStages';
import { loadCompanionDesktopSyncSummary } from '../../companionDesktopSyncSummary';
import type { CompanionDesktopSyncOptions,
  CompanionDesktopSyncResult } from '../../companionDesktopSyncTypes';
import { resolveCompanionSyncPeerId } from '../network/syncGroupPeerIdentity';
import { loadIosCompanionHostName } from '../runtime/iosCompanionActiveDatabaseReads';

import { traceCompanionSyncStep } from './diagnostics/companionDesktopSyncTrace';
import { sendCompanionFramedSyncInventoryDifferences } from './framed/companionFramedSyncInventoryRound';
import { drainCompanionSyncIdentityResources } from './syncGroupIdentityResources';
import { runCompanionSyncIdentityRestoreRound } from './syncGroupIdentityRestoreRound';
import { runCompanionSyncIdentityRound } from './syncGroupIdentityRound';
import { loadCompanionSyncGroup } from './syncGroupStore';

/** Adapt the verified identity round to the companion sync result surface. */
export async function syncCompanionIdentityObjects(endpointUrl: string,
  options: CompanionDesktopSyncOptions): Promise<CompanionDesktopSyncResult> {
  if (options.framedPeer?.protocolVersion === FRAMED_SYNC_PROTOCOL_VERSION) {
    return syncCompanionFramedNodes(endpointUrl, {
      ...options, framedPeer: options.framedPeer
    });
  }
  if (options.resourcesOnly) return continueIdentityResources(endpointUrl, options);
  const startedAt = Date.now();
  let syncedStructureElapsedMs = 0;
  const hostName = await loadIosCompanionHostName();
  const restored = options.restoreId ? await traceCompanionSyncStep({
    runId: options.runId, stage: 'identity_restore',
    task: () => runCompanionSyncIdentityRestoreRound(endpointUrl, hostName,
      options.restoreId!) }) : null;
  const round = await traceCompanionSyncStep({ runId: options.runId,
    stage: 'identity_round',
    task: () => runCompanionSyncIdentityRound(endpointUrl, hostName,
      { includeResources: options.includeResources !== false,
        onProgress: options.onProgress,
        onStructureSynced: async (receivedCount) => {
          syncedStructureElapsedMs = Date.now() - startedAt;
          const completed = (restored?.appliedObjects ?? 0) + receivedCount;
          options.onProgress?.({ completed, phase: 'structure', total: completed });
          await options.onStructureSynced?.();
        } }) });
  const appliedPackObjectCount = (restored?.appliedObjects ?? 0) +
    round.received.appliedObjects;
  const summary = options.includeResources === false ? createSkippedResourceSummary() :
    await loadCompanionDesktopSyncSummary(endpointUrl, 'identity-complete');
  return {
    appliedNodeIds: [], appliedPackBlobCount: 0, appliedPackObjectCount,
    appliedObjectIds: [], appliedReviewOpIds: [], changedObjectIds: [],
    pushedNodeIds: [], pushedObjectIds: [], pushedReviewOpIds: [],
    requestedObjectIds: [], ...summary, ...round.resources.stages,
    pushConflictCount: 0, pushError: null, pushRejectedCount: 0,
    syncedStructureElapsedMs
  };
}

async function syncCompanionFramedNodes(
  endpointUrl: string,
  options: CompanionDesktopSyncOptions & { framedPeer: NonNullable<CompanionDesktopSyncOptions['framedPeer']> }
): Promise<CompanionDesktopSyncResult> {
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
    appliedNodeIds: receivedIds, appliedObjectIds: receivedIds,
    appliedPackBlobCount: 0, appliedPackObjectCount: receivedIds.length,
    appliedReviewOpIds: [], changedObjectIds: receivedIds,
    pushedNodeIds: sentIds, pushedObjectIds: sentIds, pushedReviewOpIds: [],
    requestedObjectIds: receivedIds,
    ...createSkippedResourceSummary(), ...createEmptyResourceStages(),
    localDirtyCount: round.deferredObjects.length,
    pushConflictCount: 0, pushError: null, pushRejectedCount: 0,
    remainingStructureChangeCount: round.deferredObjects.length,
    syncedStructureElapsedMs: Date.now() - startedAt
  };
}

async function continueIdentityResources(endpointUrl: string,
  options: CompanionDesktopSyncOptions): Promise<CompanionDesktopSyncResult> {
  const group = await loadCompanionSyncGroup();
  if (!group) throw new Error('sync_group_not_joined');
  const peerId = await resolveCompanionSyncPeerId(endpointUrl);
  const resources = options.includeResources === false ? createEmptyResourceStages() :
    (await drainCompanionSyncIdentityResources({ endpointUrl,
      groupId: group.group_id, peerId, onProgress: options.onProgress })).stages;
  const summary = options.includeResources === false ? createSkippedResourceSummary() :
    await loadCompanionDesktopSyncSummary(endpointUrl, 'identity-unchecked');
  return { appliedNodeIds: [], appliedPackBlobCount: 0, appliedPackObjectCount: 0,
    appliedObjectIds: [], appliedReviewOpIds: [], changedObjectIds: [],
    pushedNodeIds: [], pushedObjectIds: [], pushedReviewOpIds: [], requestedObjectIds: [],
    ...summary, ...resources, pushConflictCount: 0, pushError: null, pushRejectedCount: 0,
    syncedStructureElapsedMs: 0 };
}
