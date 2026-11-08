import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { AttachmentReceivePaused } from '../../../../../../lib/core/sync/attachmentBlockTransfer.js';
import { attachmentDataYield, onAttachmentWorkYield } from '../../../../../../lib/core/sync/attachmentWorkBudget.js';
import { encodeFramedSyncStream, readFramedSyncStream, type FramedSyncStreamBody } from '../../../../../../lib/core/sync/framedSyncBinaryStream.js';
import { framedSyncPathWithIdentity } from '../../../../../../lib/core/sync/framedSyncHttpContract.js';
import { withRequestSyncFiles, type RequestSyncFilePort, type RequestSyncFiles } from '../../../../../../lib/core/sync/requestSyncFiles.js';
import { requestSyncPeerRoundPath, touchRequestSyncStream, type RequestSyncPeerRound } from '../../../../../../lib/core/sync/requestSyncPeerRound.js';
import type { RequestSyncAuthenticatedContext } from '../../../../../../lib/core/sync/requestSyncWire.js';
import type { NativeRequestSyncHttpRequest } from '../../../../../../lib/platform/nativeRequestSyncHttpContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';
import { companionFramedFileOwner } from '../../runtime/companionFramedPayloadBudget.js';
import { getIosCompanionDatabaseOwner } from '../../runtime/iosCompanionDatabaseBootstrap.js';

const CHUNK_BYTES = 512 * 1024;
const chunkKey = (directory: string, direction: 'in' | 'out', index: number) =>
  `${directory}/http-${direction}-${index}`;

export interface CompanionRequestSyncHttpInput {
  preparationGate?: { ready(): void; dispatch: Promise<void> };
  endpointUrl: string;
  pathWithQuery: string;
  context: RequestSyncAuthenticatedContext;
  body: FramedSyncStreamBody;
  signal?: AbortSignal;
  peerRound?: RequestSyncPeerRound;
  attachmentReceive?: NativeRequestSyncHttpRequest['attachment_receive'];
}

export async function withCompanionRequestSyncHttp<T>(files: RequestSyncFilePort, input: CompanionRequestSyncHttpInput,
  consume: (body: Awaited<ReturnType<typeof readFramedSyncStream>>) => Promise<T>) {
  return withCompanionRequestSyncHttpResponse(files, input, async (response, directory) => {
    const stream = await readFramedSyncStream(touchRequestSyncStream(
      companionRequestSyncHttpChunks(files, directory, response, input.signal), input.peerRound?.lease));
    try { return await consume(stream); }
    finally { await stream.frames[Symbol.asyncIterator]().return?.(); }
  });
}

export async function withCompanionRequestSyncHttpResponse<T>(files: RequestSyncFilePort, input: CompanionRequestSyncHttpInput,
  consume: (response: Awaited<ReturnType<typeof FolioleCompanionSync.postRequestSyncHttp>>, directory: string) => Promise<T>) {
  const shouldYield = attachmentDataYield();
  return withRequestSyncFiles(files, async temporary => {
    const { owner, requestId, request, sign, signedAt } = await prepareHttpRequest(temporary, input);
    input.signal?.throwIfAborted();
    if (input.preparationGate) await waitForDispatch(input.preparationGate, input.signal);
    if (Date.now() - signedAt >= 30_000) {
      Object.assign(request.headers, (await sign()).headers);
      input.signal?.throwIfAborted();
    }
    if (input.attachmentReceive && shouldYield()) throw new AttachmentReceivePaused();
    const operation = FolioleCompanionSync.postRequestSyncHttp(request);
    let cancellation: Promise<void> | undefined;
    const cancel = () => { cancellation = FolioleCompanionSync.cancelRequestSyncHttp({ ...owner, request_id: requestId });
      void cancellation.catch(() => undefined); };
    input.signal?.addEventListener('abort', cancel, { once: true });
    let yielded = false;
    const stopYield = input.attachmentReceive ? onAttachmentWorkYield(() => { yielded = true; cancel(); }) : () => {};
    try {
      const response = await operation;
      input.signal?.throwIfAborted();
      if (input.peerRound) input.peerRound.admitted = true;
      return await consume(response, temporary.directory);
    } catch (error) {
      if (yielded && error && typeof error === 'object' && 'code' in error && error.code === 'E_ABORT') {
        input.signal?.throwIfAborted();
        throw new AttachmentReceivePaused();
      }
      throw error;
    } finally {
      stopYield();
      input.signal?.removeEventListener('abort', cancel);
      await cancellation;
    }
  }, input.signal);
}

async function prepareHttpRequest(temporary: RequestSyncFiles, input: CompanionRequestSyncHttpInput) {
  const owner = companionFramedFileOwner(getIosCompanionDatabaseOwner());
  const prepared = await spoolCompanionRequestSyncHttp({ write: (key, bytes) => temporary.writeScratchFile(key, bytes) }, temporary.directory, { ...input.body,
    frames: touchRequestSyncStream(input.body.frames, input.peerRound?.lease) }, input.signal);
  const requestId = crypto.randomUUID();
  const pathWithQuery = framedSyncPathWithIdentity({ ...input.context,
    pathWithQuery: requestSyncPeerRoundPath(input.pathWithQuery, input.peerRound) });
  const signedAt = Date.now();
  const sign = () => FolioleCompanionSync.signCompanionSyncRequest({
    endpoint_url: input.endpointUrl, method: 'POST', nonce: crypto.randomUUID(),
    path_with_query: pathWithQuery, sync_group_id: input.context.groupId,
    timestamp: new Date().toISOString(), body_hash: prepared.hash
  });
  const signature = await sign();
  const request: NativeRequestSyncHttpRequest = { ...owner, request_id: requestId,
    directory: temporary.directory, request_chunk_count: prepared.count,
    url: new URL(pathWithQuery, input.endpointUrl).toString(), headers: {
      ...signature.headers, 'x-foliole-body-sha256': prepared.hash,
      'x-foliole-device-id': input.context.initiatorDeviceId,
      'x-foliole-library-epoch': input.context.initiatorLibraryEpoch
    }, sync_group_id: input.context.groupId, receiver_device_id: input.context.responderDeviceId,
    receiver_library_epoch: input.context.responderLibraryEpoch };
  if (input.attachmentReceive) request.attachment_receive = input.attachmentReceive;
  if (input.peerRound) request.peer_round_id = input.peerRound.id;
  return { owner, requestId, request, sign, signedAt };
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

async function waitForDispatch(gate: NonNullable<CompanionRequestSyncHttpInput['preparationGate']>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<void>((_resolve, reject) => { rejectAbort = reject; });
  const abort = () => rejectAbort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  gate.ready();
  try { await Promise.race([gate.dispatch, aborted]); signal?.throwIfAborted(); }
  finally { signal?.removeEventListener('abort', abort); }
}
