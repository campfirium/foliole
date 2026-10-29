import { watchSyncPriorityRequests } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncOverwriteInventory } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { withRequestSyncAttachmentPreparation } from '../../../../../../lib/core/sync/requestSyncAttachmentPreparation.js';
import { transferRequestSyncBatch } from '../../../../../../lib/core/sync/requestSyncBatchExchange.js';
import { exchangeRequestSyncInventory } from '../../../../../../lib/core/sync/requestSyncDatabaseExchange.js';
import { runRequestSyncDatabaseRound, type RequestSyncDatabaseRoundPort } from '../../../../../../lib/core/sync/requestSyncDatabaseRound.js';
import type { RequestSyncDatabaseHost } from '../../../../../../lib/core/sync/requestSyncObjectEndpoint.js';
import { runRequestSyncOverwriteRound } from '../../../../../../lib/core/sync/requestSyncOverwriteRound.js';
import type { RequestSyncPeerRound } from '../../../../../../lib/core/sync/requestSyncPeerRound.js';
import { loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import type { SyncGroupMemberStatePayload } from '../../../../../../lib/platform/syncGroupMemberStateContract.js';
import type { CompanionDesktopSyncProgress } from '../../../companionDesktopSyncTypes.js';
import { withCompanionForegroundTimeMaintenance } from '../../runtime/companionForegroundTime.js';
import { loadCurrentCredential } from '../syncGroupProviderCredentialStore.js';

import { createLargeRoundBackgroundWork } from './companionLargeRoundBackgroundWork.js';
import { createOverwriteReceiveProgress } from './companionOverwriteReceiveProgress.js';
import { currentCompanionRequestSyncDatabaseHost } from './companionRequestSyncDatabaseHost.js';
import { createCompanionRequestSyncExchange } from './companionRequestSyncExchange.js';
import { afterCompanionRequestSyncRounds, withCompanionRequestSyncLifecycle } from './companionRequestSyncLifecycle.js';

type RoundInput = {
  endpointUrl: string;
  groupId: string;
  localLibraryEpoch: string;
  peerState: SyncGroupMemberStatePayload;
  restoreId?: string;
  signal?: AbortSignal;
  peerRound?: RequestSyncPeerRound;
  reportObjectError: RequestSyncDatabaseRoundPort['reportObjectError'];
  onProgress?(progress: CompanionDesktopSyncProgress): void;
  large?: ReturnType<typeof createLargeRoundBackgroundWork>;
};

export function runCompanionRequestSyncDatabaseRound(input: RoundInput) {
  return withCompanionRequestSyncLifecycle(async signal => {
    const large = createLargeRoundBackgroundWork();
    // The rest of the same sync, such as resources and adoption completion, keeps the work too.
    try { return await runRound({ ...input, signal, large }); } finally { afterCompanionRequestSyncRounds(large.release); }
  }, input.signal);
}

async function runRound(input: RoundInput) {
  return withRequestSyncAttachmentPreparation(await currentCompanionRequestSyncDatabaseHost(), input.signal,
    host => runPreparedRound(host, input));
}

async function runPreparedRound(host: RequestSyncDatabaseHost, input: RoundInput) {
  const credential = await loadCurrentCredential({ group_id: input.groupId });
  const adoption = await host.readSnapshot(loadSyncGroupLocalAdoption, input.signal);
  const peerDeviceId = input.peerState.sender_device_identity_key;
  if (adoption && (adoption.groupId !== input.groupId || adoption.providerDeviceId !== peerDeviceId)) {
    throw new Error('sync_group_local_adoption_source_mismatch');
  }
  const overwriteId = adoption?.libraryEpoch ?? input.restoreId;
  const context = { groupId: input.groupId, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: credential.device_id, initiatorLibraryEpoch: overwriteId ?? input.localLibraryEpoch,
    responderDeviceId: peerDeviceId, responderLibraryEpoch: input.peerState.library_epoch } as const;
  const encodedKey = credential.workgroup_key.replaceAll('-', '+').replaceAll('_', '/');
  const groupKey = Uint8Array.from(atob(encodedKey), character => character.charCodeAt(0));
  const exchange = createCompanionRequestSyncExchange(host, { context, groupKey,
    ...(input.peerRound ? { peerRound: input.peerRound } : {}),
    endpointUrl: input.endpointUrl, ...(input.signal ? { signal: input.signal } : {}) });
  const progress = { groupId: context.groupId, overwriteId: overwriteId ?? '', providerDeviceId: peerDeviceId,
    providerLibraryEpoch: context.responderLibraryEpoch, receiverDeviceId: context.initiatorDeviceId,
    receiverLibraryEpoch: context.initiatorLibraryEpoch };
  let receivingOverwrite = Boolean(overwriteId);
  const received = new Set<string>();
  const sent = new Set<string>();
  const receiveProgress = createOverwriteReceiveProgress(overwriteId ? input.onProgress : undefined, () => receivingOverwrite);
  let workspaceChanged = Boolean(overwriteId);
  const port: RequestSyncDatabaseRoundPort = {
    exchangeInventory: async () => input.large!.inventory(receiveProgress.inventory(await exchangeRequestSyncInventory(host, exchange, receivingOverwrite
      ? await host.readSnapshot(db => readFramedSyncOverwriteInventory(db, { groupId: context.groupId,
        protocolVersion: context.protocolVersion, senderDeviceId: peerDeviceId,
        senderLibraryEpoch: context.responderLibraryEpoch, receiverDeviceId: context.initiatorDeviceId,
        receiverLibraryEpoch: context.initiatorLibraryEpoch }), input.signal) : undefined))),
    transferObjects: async differences => {
      const results = await transferRequestSyncBatch(host, exchange, differences, { peerState: input.peerState });
      for (const [index, result] of results.entries()) if (!result.error) {
        (differences[index]!.direction === 'local_to_remote' ? sent : received).add(result.globalId);
        if (differences[index]!.direction === 'remote_to_local' && result.objectType !== 'foreground_source') {
          workspaceChanged = true;
        }
      }
      receiveProgress.received(received.size);
      input.large!.transferred(results.length);
      return results;
    },
    reportObjectError: input.reportObjectError,
    watchLocalChanges: watchSyncPriorityRequests
  };
  if (!overwriteId) return completeDatabaseRound(host, port, input.signal, { received, sent, workspaceChanged, peerRound: input.peerRound });
  let result = await withCompanionForegroundTimeMaintenance(async () => {
    await host.write(db => prepareSyncGroupOverwrite(db, progress));
    return runRequestSyncOverwriteRound(host, progress, port, input.signal);
  }, async () => !await host.readSnapshot(loadSyncGroupOverwriteProgress));
  if (result.complete && adoption) {
    receivingOverwrite = false;
    const continuation = await runRequestSyncDatabaseRound(port, input.signal);
    result = { ...continuation, transferred: result.transferred + continuation.transferred,
      madeProgress: result.madeProgress || continuation.madeProgress };
  }
  return { ...result, received: [...received], sent: [...sent], workspaceChanged };
}

async function completeDatabaseRound(host: RequestSyncDatabaseHost, port: RequestSyncDatabaseRoundPort, signal: AbortSignal | undefined,
  scope: { received: Set<string>; sent: Set<string>; workspaceChanged: boolean; peerRound: RequestSyncPeerRound | undefined }) {
  const result = await runRequestSyncDatabaseRound(port, signal);
  if (result.complete) {
    if (scope.peerRound) scope.peerRound.databaseConfirmed = true;
    await host.databaseRoundCompleted?.();
  }
  return { ...result, received: [...scope.received], sent: [...scope.sent], workspaceChanged: scope.workspaceChanged };
}
