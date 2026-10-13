import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { exchangeRequestSyncAttachments } from '../../../../../../lib/core/sync/requestSyncAttachmentExchange.js';
import type { RequestSyncPeerRound } from '../../../../../../lib/core/sync/requestSyncPeerRound.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { loadCurrentCredential } from '../syncGroupProviderCredentialStore.js';

import { currentCompanionAttachmentHost } from './companionAttachmentBlockFiles.js';
import { currentCompanionRequestSyncDatabaseHost } from './companionRequestSyncDatabaseHost.js';
import { createCompanionRequestSyncExchange } from './companionRequestSyncExchange.js';
import { withCompanionRequestSyncLifecycle } from './companionRequestSyncLifecycle.js';

export function continueCompanionRequestSyncResources(input: NativeCompanionFramedSyncInventoryRequest & {
  peerRound?: RequestSyncPeerRound; signal?: AbortSignal;
}) {
  return withCompanionRequestSyncLifecycle(async signal => {
    const host = await currentCompanionRequestSyncDatabaseHost();
    const credential = await loadCurrentCredential({ group_id: input.sync_group_id });
    const [proof] = await host.readSnapshot(db => db.query<{ library_epoch: string }>(
      'SELECT library_epoch FROM node_version_local_proof_state WHERE singleton_id = 1'));
    if (!proof) throw new Error('request_sync_local_epoch_missing');
    const encoded = credential.workgroup_key.replaceAll('-', '+').replaceAll('_', '/');
    const groupKey = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const context = { groupId: input.sync_group_id, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      initiatorDeviceId: credential.device_id, initiatorLibraryEpoch: proof.library_epoch,
      responderDeviceId: input.receiver_device_id, responderLibraryEpoch: input.receiver_library_epoch } as const;
    return exchangeRequestSyncAttachments(await currentCompanionAttachmentHost(host),
      createCompanionRequestSyncExchange(host, { context, groupKey, endpointUrl: input.endpoint_url, signal,
        ...(input.peerRound ? { peerRound: input.peerRound } : {}) }),
      (storageKey, error) => console.error('[sync] attachment transfer failed', { storageKey, error: String(error) }));
  }, input.signal);
}
