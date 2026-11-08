import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { exchangeRequestSyncAttachments, pullRequestSyncAttachment } from '../../../../../../lib/core/sync/requestSyncAttachmentExchange.js';
import type { RequestSyncAttachmentHost } from '../../../../../../lib/core/sync/requestSyncAttachmentResponse.js';
import type { RequestSyncExchange } from '../../../../../../lib/core/sync/requestSyncDatabaseExchange.js';
import { withRequestSyncPeerRound, type RequestSyncPeerRound } from '../../../../../../lib/core/sync/requestSyncPeerRound.js';
import type { NativeCompanionFramedSyncInventoryRequest } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { loadCurrentCredential } from '../syncGroupProviderCredentialStore.js';

import { currentCompanionAttachmentHost } from './companionAttachmentBlockFiles.js';
import { currentCompanionRequestSyncDatabaseHost } from './companionRequestSyncDatabaseHost.js';
import { createCompanionRequestSyncExchange } from './companionRequestSyncExchange.js';
import { withCompanionRequestSyncLifecycle } from './companionRequestSyncLifecycle.js';
import { requireCompanionRequestSyncPeerState } from './companionRequestSyncPeerState.js';

type ResourceInput = NativeCompanionFramedSyncInventoryRequest & {
  peerRound?: RequestSyncPeerRound; signal?: AbortSignal; boundedSlice?: boolean;
};

export function continueCompanionRequestSyncResources(input: ResourceInput) {
  return withResources(input, (host, exchange) => exchangeRequestSyncAttachments(host, exchange,
    (storageKey, error) => console.error('[sync] attachment transfer failed', { storageKey, error: String(error) }),
    input.boundedSlice ? () => true : undefined));
}

export function pullCompanionRequestSyncResource(input: ResourceInput & {
  peerRound: RequestSyncPeerRound; storageKey: string;
}) {
  requireCompanionRequestSyncPeerState(input.sync_group_id, input.receiver_device_id, input.receiver_library_epoch);
  return withResources(input, (host, exchange) => withRequestSyncPeerRound(exchange, input.peerRound,
    () => pullRequestSyncAttachment(host, exchange, input.storageKey)));
}

function withResources<T>(input: ResourceInput,
  run: (host: RequestSyncAttachmentHost, exchange: RequestSyncExchange) => Promise<T>) {
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
    return run(await currentCompanionAttachmentHost(host),
      createCompanionRequestSyncExchange(host, { context, groupKey, endpointUrl: input.endpoint_url, signal,
        ...(input.peerRound ? { peerRound: input.peerRound } : {}) }));
  }, input.signal);
}
