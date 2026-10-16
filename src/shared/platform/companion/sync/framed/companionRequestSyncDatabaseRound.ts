import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { readFramedSyncOverwriteInventory } from '../../../../../../lib/core/sync/framedSyncInventoryRead.js';
import { transferRequestSyncBatch } from '../../../../../../lib/core/sync/requestSyncBatchExchange.js';
import { exchangeRequestSyncInventory } from '../../../../../../lib/core/sync/requestSyncDatabaseExchange.js';
import { runRequestSyncDatabaseRound, type RequestSyncDatabaseRoundPort } from '../../../../../../lib/core/sync/requestSyncDatabaseRound.js';
import { runRequestSyncOverwriteRound } from '../../../../../../lib/core/sync/requestSyncOverwriteRound.js';
import type { RequestSyncPeerRound } from '../../../../../../lib/core/sync/requestSyncPeerRound.js';
import { loadSyncGroupLocalAdoption } from '../../../../../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../../../../../lib/core/sync/syncGroupOverwriteProgress.js';
import type { SyncGroupMemberStatePayload } from '../../../../../../lib/platform/syncGroupMemberStateContract.js';
import { withCompanionForegroundTimeMaintenance } from '../../runtime/companionForegroundTime.js';
import { loadCurrentCredential } from '../syncGroupProviderCredentialStore.js';

import { currentCompanionRequestSyncDatabaseHost } from './companionRequestSyncDatabaseHost.js';
import { createCompanionRequestSyncExchange } from './companionRequestSyncExchange.js';
import { withCompanionRequestSyncLifecycle } from './companionRequestSyncLifecycle.js';

type RoundInput = {
  endpointUrl: string;
  groupId: string;
  localLibraryEpoch: string;
  peerState: SyncGroupMemberStatePayload;
  restoreId?: string;
  signal?: AbortSignal;
  peerRound?: RequestSyncPeerRound;
  reportObjectError: RequestSyncDatabaseRoundPort['reportObjectError'];
};

export function runCompanionRequestSyncDatabaseRound(input: RoundInput) {
  return withCompanionRequestSyncLifecycle(signal => runRound({ ...input, signal }), input.signal);
}

async function runRound(input: RoundInput) {
  const host = await currentCompanionRequestSyncDatabaseHost();
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
  let workspaceChanged = Boolean(overwriteId);
  const port: RequestSyncDatabaseRoundPort = {
    exchangeInventory: async () => exchangeRequestSyncInventory(host, exchange, receivingOverwrite
      ? await host.readSnapshot(db => readFramedSyncOverwriteInventory(db, { groupId: context.groupId,
        protocolVersion: context.protocolVersion, senderDeviceId: peerDeviceId,
        senderLibraryEpoch: context.responderLibraryEpoch, receiverDeviceId: context.initiatorDeviceId,
        receiverLibraryEpoch: context.initiatorLibraryEpoch }), input.signal) : undefined),
    transferObjects: async differences => {
      const results = await transferRequestSyncBatch(host, exchange, differences, { peerState: input.peerState });
      for (const [index, result] of results.entries()) if (!result.error) {
        (differences[index]!.direction === 'local_to_remote' ? sent : received).add(result.globalId);
        if (differences[index]!.direction === 'remote_to_local' && result.objectType !== 'foreground_source') {
          workspaceChanged = true;
        }
      }
      return results;
    },
    reportObjectError: input.reportObjectError
  };
  if (!overwriteId) return { ...await runRequestSyncDatabaseRound(port, input.signal), received: [...received], sent: [...sent], workspaceChanged };
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
