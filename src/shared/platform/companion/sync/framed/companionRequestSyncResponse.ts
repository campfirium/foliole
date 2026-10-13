import { readFramedSyncStream } from '../../../../../../lib/core/sync/framedSyncBinaryStream.js';
import type { FramedSyncStreamBody } from '../../../../../../lib/core/sync/framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../../../../../lib/core/sync/framedSyncContract.js';
import { respondRequestSyncAttachments } from '../../../../../../lib/core/sync/requestSyncAttachmentResponse.js';
import { respondRequestSyncDatabase } from '../../../../../../lib/core/sync/requestSyncDatabaseResponse.js';
import { parseRequestSyncPeerRound, respondRequestSyncRoundControl, touchRequestSyncStream } from '../../../../../../lib/core/sync/requestSyncPeerRound.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';
import { loadCurrentCredential } from '../syncGroupProviderCredentialStore.js';

import { currentCompanionAttachmentHost } from './companionAttachmentBlockFiles.js';
import { currentCompanionRequestSyncDatabaseHost } from './companionRequestSyncDatabaseHost.js';
import { companionRequestSyncHttpChunks, spoolCompanionRequestSyncHttp } from './companionRequestSyncHttp.js';
import { combineCompanionRequestSignals, withCompanionRequestSyncLifecycle } from './companionRequestSyncLifecycle.js';
import { requireCompanionRequestSyncPeerState } from './companionRequestSyncPeerState.js';
import { companionSyncPeerRoundOwner } from './companionSyncPeerRounds.js';

/** Native authenticates the HTTP envelope; the shared receiver authenticates every encrypted frame. */
type Response = { response_chunk_count: number };

export function respondCompanionRequestSync(payload: Record<string, unknown>, acknowledge?: (result: Response) => Promise<void>) {
  return withCompanionRequestSyncLifecycle(signal => respond(payload, signal, acknowledge));
}

async function respond(payload: Record<string, unknown>, parentSignal: AbortSignal, acknowledge?: (result: Response) => Promise<void>) {
  const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
  if (payload.library_key !== owner.library_key || payload.generation_id !== owner.generation_id) {
    throw new Error('request_sync_library_changed');
  }
  const directory = text(payload, 'directory');
  if (!/^requests\/[a-f0-9-]{36}$/u.test(directory)) throw new Error('request_sync_http_request_invalid');
  const mode = payload.mode;
  if (mode !== 'inventory' && mode !== 'pull' && mode !== 'object' && mode !== 'pulls' && mode !== 'objects' &&
      mode !== 'attachments' && mode !== 'round_finish') {
    throw new Error('request_sync_mode_invalid');
  }
  const context = { groupId: text(payload, 'group_id'), protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: text(payload, 'initiator_device_id'), initiatorLibraryEpoch: text(payload, 'initiator_library_epoch'),
    responderDeviceId: text(payload, 'responder_device_id'), responderLibraryEpoch: text(payload, 'responder_library_epoch') } as const;
  const peerState = requireCompanionRequestSyncPeerState(context.groupId, context.initiatorDeviceId, context.initiatorLibraryEpoch);
  const credential = await loadCurrentCredential({ group_id: context.groupId });
  if (credential.device_id !== context.responderDeviceId) throw new Error('request_sync_peer_context_mismatch');
  const round = parseRequestSyncPeerRound(payload.peer_round_id, payload.peer_round_mode);
  const rounds = await companionSyncPeerRoundOwner();
  const lease = rounds.acceptInbound(context.initiatorDeviceId, round.id, round.mode === 'start' || round.mode === 'single');
  const { signal, dispose } = combineCompanionRequestSignals([parentSignal, lease.signal]);
  let host: Awaited<ReturnType<typeof currentCompanionRequestSyncDatabaseHost>> | undefined;
  let stream: FramedSyncStreamBody | undefined;
  try {
    const groupKey = Uint8Array.from(atob(credential.workgroup_key.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
    host = await currentCompanionRequestSyncDatabaseHost();
    const files = host.files;
    stream = await readFramedSyncStream(touchRequestSyncStream(companionRequestSyncHttpChunks(host.files, directory, {
      response_chunk_count: Number(payload.request_chunk_count), response_byte_length: Number(payload.request_byte_length)
    }, signal), lease));
    const consume = async (response: FramedSyncStreamBody) => {
      const result = await spoolCompanionRequestSyncHttp(files, directory,
        { ...response, frames: touchRequestSyncStream(response.frames, lease) }, signal);
      const receipt = { response_chunk_count: result.count };
      await acknowledge?.(receipt);
      return receipt;
    };
    if (mode === 'round_finish') return await consume(
      await respondRequestSyncRoundControl({ context, groupKey, stream, signal, roundId: round.id }));
    if (mode === 'attachments') return await respondRequestSyncAttachments(await currentCompanionAttachmentHost(host),
      { context, groupKey, stream, signal, onProgress: () => lease.touch() }, consume);
    return await respondRequestSyncDatabase(host, { context, groupKey, mode, stream, signal,
      ...(mode === 'objects' ? { batch: { peerState } } : {}),
      ...(mode === 'object' ? { object: { peerState, expectedObject: {
        globalId: text(payload, 'global_id'), objectType: text(payload, 'object_type') } } } : {}) },
    consume);
  } catch (error) {
    if (round.mode === 'start' || round.mode === 'single') rounds.finishInbound(context.initiatorDeviceId, round.id);
    await host?.files.remove(directory);
    throw error;
  } finally {
    dispose();
    if (signal.aborted) rounds.finishInbound(context.initiatorDeviceId, round.id);
    await stream?.frames[Symbol.asyncIterator]().return?.();
  }
}

function text(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error('request_sync_http_request_invalid');
  return value;
}
