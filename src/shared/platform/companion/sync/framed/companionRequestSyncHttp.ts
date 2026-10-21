import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { encodeFramedSyncStream, readFramedSyncStream, type FramedSyncStreamBody } from '../../../../../../lib/core/sync/framedSyncBinaryStream.js';
import { framedSyncPathWithIdentity } from '../../../../../../lib/core/sync/framedSyncHttpContract.js';
import { withRequestSyncFiles, type RequestSyncFilePort } from '../../../../../../lib/core/sync/requestSyncFiles.js';
import { requestSyncPeerRoundPath, touchRequestSyncStream, type RequestSyncPeerRound } from '../../../../../../lib/core/sync/requestSyncPeerRound.js';
import type { RequestSyncAuthenticatedContext } from '../../../../../../lib/core/sync/requestSyncWire.js';
import type { NativeRequestSyncHttpRequest } from '../../../../../../lib/platform/nativeRequestSyncHttpContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

const CHUNK_BYTES = 512 * 1024;
const chunkKey = (directory: string, direction: 'in' | 'out', index: number) =>
  `${directory}/http-${direction}-${index}`;

export async function withCompanionRequestSyncHttp<T>(files: RequestSyncFilePort, input: {
  endpointUrl: string;
  pathWithQuery: string;
  context: RequestSyncAuthenticatedContext;
  body: FramedSyncStreamBody;
  signal?: AbortSignal;
  peerRound?: RequestSyncPeerRound;
}, consume: (body: Awaited<ReturnType<typeof readFramedSyncStream>>) => Promise<T>) {
  return withRequestSyncFiles(files, async temporary => {
    const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
    const prepared = await spoolCompanionRequestSyncHttp({ write: (key, bytes) => temporary.writeScratchFile(key, bytes) }, temporary.directory, { ...input.body,
      frames: touchRequestSyncStream(input.body.frames, input.peerRound?.lease) }, input.signal);
    const requestId = crypto.randomUUID();
    const pathWithQuery = framedSyncPathWithIdentity({ ...input.context,
      pathWithQuery: requestSyncPeerRoundPath(input.pathWithQuery, input.peerRound) });
    const signature = await FolioleCompanionSync.signCompanionSyncRequest({
      endpoint_url: input.endpointUrl, method: 'POST', nonce: crypto.randomUUID(),
      path_with_query: pathWithQuery, sync_group_id: input.context.groupId,
      timestamp: new Date().toISOString(), body_hash: prepared.hash
    });
    const request: NativeRequestSyncHttpRequest = { ...owner, request_id: requestId,
      directory: temporary.directory, request_chunk_count: prepared.count,
      url: new URL(pathWithQuery, input.endpointUrl).toString(), headers: {
        ...signature.headers, 'x-foliole-body-sha256': prepared.hash,
        'x-foliole-device-id': input.context.initiatorDeviceId,
        'x-foliole-library-epoch': input.context.initiatorLibraryEpoch
      }, sync_group_id: input.context.groupId, receiver_device_id: input.context.responderDeviceId,
      receiver_library_epoch: input.context.responderLibraryEpoch };
    if (input.peerRound) request.peer_round_id = input.peerRound.id;
    input.signal?.throwIfAborted();
    const operation = FolioleCompanionSync.postRequestSyncHttp(request);
    let cancellation: Promise<void> | undefined;
    const cancel = () => { cancellation = FolioleCompanionSync.cancelRequestSyncHttp({ ...owner, request_id: requestId });
      void cancellation.catch(() => undefined); };
    input.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const response = await operation;
      input.signal?.throwIfAborted();
      if (input.peerRound) input.peerRound.admitted = true;
      const stream = await readFramedSyncStream(touchRequestSyncStream(
        companionRequestSyncHttpChunks(files, temporary.directory, response, input.signal), input.peerRound?.lease));
      try {
        return await consume(stream);
      }
      finally { await stream.frames[Symbol.asyncIterator]().return?.(); }
    } finally {
      input.signal?.removeEventListener('abort', cancel);
      await cancellation;
    }
  }, input.signal);
}

export async function spoolCompanionRequestSyncHttp(files: Pick<RequestSyncFilePort, 'write'>, directory: string, body: FramedSyncStreamBody, signal?: AbortSignal) {
  const digest = sha256.create();
  let count = 0;
  let pending = new Uint8Array(CHUNK_BYTES);
  let used = 0;
  for await (const bytes of encodeFramedSyncStream(body)) {
    let offset = 0;
    while (offset < bytes.length) {
      signal?.throwIfAborted();
      const size = Math.min(CHUNK_BYTES - used, bytes.length - offset);
      pending.set(bytes.subarray(offset, offset + size), used);
      used += size;
      offset += size;
      if (used === CHUNK_BYTES) {
        await files.write(chunkKey(directory, 'out', count++), pending);
        digest.update(pending);
        pending = new Uint8Array(CHUNK_BYTES);
        used = 0;
      }
    }
  }
  signal?.throwIfAborted();
  if (used) {
    const tail = pending.subarray(0, used);
    await files.write(chunkKey(directory, 'out', count++), tail);
    digest.update(tail);
  }
  return { count, hash: bytesToHex(digest.digest()) };
}

export async function* companionRequestSyncHttpChunks(files: RequestSyncFilePort, directory: string,
  response: { response_chunk_count: number; response_byte_length: number }, signal?: AbortSignal) {
  const { response_chunk_count: count, response_byte_length: length } = response;
  if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(length) || length < 1 ||
      Math.ceil(length / CHUNK_BYTES) !== count) throw new Error('request_sync_http_response_invalid');
  for (let index = 0; index < count; index++) {
    signal?.throwIfAborted();
    const chunk = await files.read(chunkKey(directory, 'in', index));
    if (!chunk || chunk.length !== Math.min(CHUNK_BYTES, length - index * CHUNK_BYTES)) {
      throw new Error('request_sync_http_response_truncated');
    }
    yield chunk;
  }
}
