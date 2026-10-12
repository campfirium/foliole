import { readFramedSyncStream } from '../../../../../../lib/core/sync/framedSyncBinaryStream.js';
import type { FramedSyncStreamBody } from '../../../../../../lib/core/sync/framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { respondRequestSyncAttachments } from '../../../../../../lib/core/sync/requestSyncAttachmentResponse.js';
import { respondRequestSyncDatabase } from '../../../../../../lib/core/sync/requestSyncDatabaseResponse.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';
import { loadCurrentCredential } from '../syncGroupProviderCredentialStore.js';

import { currentCompanionAttachmentHost } from './companionAttachmentBlockFiles.js';
import { currentCompanionRequestSyncDatabaseHost } from './companionRequestSyncDatabaseHost.js';
import { companionRequestSyncHttpChunks, spoolCompanionRequestSyncHttp } from './companionRequestSyncHttp.js';
import { withCompanionRequestSyncLifecycle } from './companionRequestSyncLifecycle.js';
import { requireCompanionRequestSyncPeerState } from './companionRequestSyncPeerState.js';

/** Native authenticates the HTTP envelope; the shared receiver authenticates every encrypted frame. */
type Response = { response_chunk_count: number };

export function respondCompanionRequestSync(payload: Record<string, unknown>, acknowledge?: (result: Response) => Promise<void>) {
  return withCompanionRequestSyncLifecycle(signal => respond(payload, signal, acknowledge));
}

async function respond(payload: Record<string, unknown>, signal: AbortSignal, acknowledge?: (result: Response) => Promise<void>) {
  const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
  if (payload.library_key !== owner.library_key || payload.generation_id !== owner.generation_id) {
    throw new Error('request_sync_library_changed');
  }
  const directory = text(payload, 'directory');
  if (!/^requests\/[a-f0-9-]{36}$/u.test(directory)) throw new Error('request_sync_http_request_invalid');
  const mode = payload.mode;
  if (mode !== 'inventory' && mode !== 'pull' && mode !== 'object' && mode !== 'pulls' && mode !== 'objects' && mode !== 'attachments') {
    throw new Error('request_sync_mode_invalid');
  }
  const context = { groupId: text(payload, 'group_id'), protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: text(payload, 'initiator_device_id'), initiatorLibraryEpoch: text(payload, 'initiator_library_epoch'),
    responderDeviceId: text(payload, 'responder_device_id'), responderLibraryEpoch: text(payload, 'responder_library_epoch') } as const;
  const peerState = requireCompanionRequestSyncPeerState(context.groupId, context.initiatorDeviceId, context.initiatorLibraryEpoch);
  const credential = await loadCurrentCredential({ group_id: context.groupId });
  if (credential.device_id !== context.responderDeviceId) throw new Error('request_sync_peer_context_mismatch');
  const groupKey = Uint8Array.from(atob(credential.workgroup_key.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
  const host = await currentCompanionRequestSyncDatabaseHost();
  const stream = await readFramedSyncStream(companionRequestSyncHttpChunks(host.files, directory, {
    response_chunk_count: Number(payload.request_chunk_count), response_byte_length: Number(payload.request_byte_length)
  }, signal));
  const consume = async (response: FramedSyncStreamBody) => {
    const result = await spoolCompanionRequestSyncHttp(host.files, directory, response, signal);
    const receipt = { response_chunk_count: result.count };
    await acknowledge?.(receipt);
    return receipt;
  };
  try {
    if (mode === 'attachments') return await respondRequestSyncAttachments(await currentCompanionAttachmentHost(host),
      { context, groupKey, stream, signal }, consume);
    return await respondRequestSyncDatabase(host, { context, groupKey, mode, stream, signal,
      ...(mode === 'objects' ? { batch: { peerState } } : {}),
      ...(mode === 'object' ? { object: { peerState, expectedObject: {
        globalId: text(payload, 'global_id'), objectType: text(payload, 'object_type') } } } : {}) },
    consume);
  } catch (error) {
    await host.files.remove(directory);
    throw error;
  } finally { await stream.frames[Symbol.asyncIterator]().return?.(); }
}

function text(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error('request_sync_http_request_invalid');
  return value;
}
