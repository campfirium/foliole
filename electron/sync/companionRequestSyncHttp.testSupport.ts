import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { readFramedSyncStream } from '../../lib/core/sync/framedSyncBinaryStream.js';
import { FRAMED_SYNC_PROTOCOL_VERSION } from '../../lib/core/sync/framedSyncContract.js';
import type { FramedSyncFilePort } from '../../lib/core/sync/framedSyncFilePort.js';
import { FRAMED_SYNC_CONTENT_TYPE } from '../../lib/core/sync/framedSyncHttpContract.js';
import { attachmentRequestSchema, assertAttachmentResponse } from '../../lib/core/sync/requestSyncAttachmentContract.js';
import { readRequestSyncWire, type RequestSyncAuthenticatedContext } from '../../lib/core/sync/requestSyncWire.js';
import type { NativeRequestSyncHttpRequest } from '../../lib/platform/nativeRequestSyncHttpContract.js';

type AttachmentFixture = {
  loadCredential(groupId: string): Promise<{ device_id: string; workgroup_key: string }>;
  append(key: string, offset: number, data: Uint8Array): Promise<unknown>;
};

/** Substitute the OS file/HTTP boundary while retaining the production JS request path. */
export async function postCompanionRequestFixture(files: Pick<FramedSyncFilePort, 'read' | 'write'>, input: NativeRequestSyncHttpRequest,
  attachment?: AttachmentFixture, signal?: AbortSignal) {
  const chunks: Uint8Array[] = [];
  for (let index = 0; index < input.request_chunk_count; index++) {
    const chunk = await files.read(`${input.directory}/http-out-${index}`);
    if (!chunk) throw new Error('fixture_request_chunk_missing');
    chunks.push(chunk);
  }
  const response = await fetch(input.url, { method: 'POST', body: Buffer.concat(chunks),
    ...(signal ? { signal } : {}), headers: { ...input.headers, 'Content-Type': FRAMED_SYNC_CONTENT_TYPE } });
  if (!response.ok) {
    const body = await response.text();
    // Match native transports' explicit round-contention error codes.
    let detail: unknown;
    try { detail = JSON.parse(body); } catch { detail = null; }
    if (typeof detail === 'object' && detail !== null && 'error' in detail
      && (detail.error === 'sync_round_busy' || detail.error === 'sync_round_expired')) {
      throw new Error(`framed_sync_http_${response.status}:${detail.error}`);
    }
    throw new Error(`request_sync_http_${response.status}:${body}`);
  }
  if (input.attachment_receive) {
    if (!attachment) throw new Error('fixture_attachment_receiver_missing');
    return receiveAttachmentResponse(response, input, attachment);
  }
  return spoolResponse(files, input.directory, new Uint8Array(await response.arrayBuffer()));
}

async function spoolResponse(files: Pick<FramedSyncFilePort, 'write'>, directory: string, bytes: Uint8Array) {
  const size = 512 * 1024;
  for (let offset = 0; offset < bytes.length; offset += size) {
    await files.write(`${directory}/http-in-${offset / size}`, bytes.subarray(offset, offset + size));
  }
  return { response_chunk_count: Math.ceil(bytes.length / size), response_byte_length: bytes.length };
}

async function receiveAttachmentResponse(response: Response, input: NativeRequestSyncHttpRequest, fixture: AttachmentFixture) {
  const plan = input.attachment_receive!;
  const query = attachmentRequestSchema.parse({ operation: 'pull', requestId: Buffer.from(plan.request_id_base64, 'base64'),
    storageKey: plan.storage_key, byteLength: plan.byte_length, offset: plan.offset, maxBlocks: plan.max_blocks });
  const credential = await fixture.loadCredential(input.sync_group_id);
  if (credential.device_id !== plan.initiator_device_id) throw new Error('attachment_response_initiator_mismatch');
  if (!plan.max_blocks || !query.storageKey || !query.byteLength || query.byteLength > 8589934592 || query.offset >= query.byteLength ||
      query.offset % ATTACHMENT_BLOCK_BYTES !== 0) throw new Error('attachment_receive_authorization_invalid');
  const context: RequestSyncAuthenticatedContext = { groupId: input.sync_group_id, protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
    initiatorDeviceId: plan.initiator_device_id, initiatorLibraryEpoch: plan.initiator_library_epoch,
    responderDeviceId: input.receiver_device_id, responderLibraryEpoch: input.receiver_library_epoch };
  const stream = await readFramedSyncStream(responseChunks(response));
  let offset = query.offset;
  let blocks = 0;
  let ended = false;
  let pending = false;
  for await (const decoded of readRequestSyncWire({ ...stream, context, groupKey: Buffer.from(credential.workgroup_key, 'base64url') })) {
    if (ended || decoded.message.payloadCase !== 'request_attachment') throw new Error('attachment_response_invalid');
    const message = attachmentRequestSchema.parse(decoded.message.payload);
    if (decoded.encoded.length - message.data.length > 24584) throw new Error('attachment_response_frame_limit');
    assertAttachmentResponse(message, query);
    if (message.byteLength !== query.byteLength || message.offset !== offset) throw new Error('attachment_pull_offset_invalid');
    if (message.state === 'end') {
      if (message.data.length || (!blocks && !message.pending && offset !== query.byteLength)) throw new Error('attachment_pull_incomplete');
      ended = true;
      pending = message.pending;
    } else {
      if (message.state !== 'block' || blocks >= query.maxBlocks || offset >= query.byteLength ||
          message.data.length !== Math.min(ATTACHMENT_BLOCK_BYTES, query.byteLength - offset)) throw new Error('attachment_pull_block_limit_invalid');
      await fixture.append(query.storageKey, offset, message.data);
      offset += message.data.length;
      blocks++;
    }
  }
  if (!ended) throw new Error('attachment_response_incomplete');
  return { response_chunk_count: 0, response_byte_length: 0, attachment_receive: { offset, blocks, pending } };
}

async function* responseChunks(response: Response) {
  if (!response.body) throw new Error('attachment_response_missing');
  const reader = response.body.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
}
