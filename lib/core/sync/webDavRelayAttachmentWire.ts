import { ATTACHMENT_BLOCK_BYTES, attachmentBlockResourceSchema, type AttachmentBlockResource } from './attachmentBlockReceiver.js';
import type { AttachmentBlockDestination, AttachmentSourceFile } from './attachmentBlockTransfer.js';
import { readFramedSyncStream } from './framedSyncBinaryStream.js';
import { assertAttachmentResponse, attachmentMessage, attachmentRequestSchema,
  type AttachmentRequest } from './requestSyncAttachmentContract.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from './requestSyncWire.js';

export const WEB_DAV_ATTACHMENT_SUFFIX = '.asset.dat';

type Auth = { context: RequestSyncAuthenticatedContext; groupKey: Uint8Array; signal?: AbortSignal | undefined };

export function prepareWebDavAttachment(file: AttachmentSourceFile, auth: Auth) {
  const resource = attachmentBlockResourceSchema.parse(file.resource);
  const requestId = crypto.getRandomValues(new Uint8Array(16));
  const common = { ...resource, requestId, operation: 'pull' as const };
  return prepareRequestSyncWire({ context: auth.context, groupKey: auth.groupKey, ...(auth.signal ? { signal: auth.signal } : {}), messages: async function* () {
    for (let offset = 0; offset < resource.byteLength; offset += ATTACHMENT_BLOCK_BYTES) {
      const data = await file.read(offset, Math.min(ATTACHMENT_BLOCK_BYTES, resource.byteLength - offset));
      yield attachmentMessage({ ...common, offset, data, state: 'block' });
    }
    yield attachmentMessage({ ...common, offset: resource.byteLength, state: 'end' });
  } });
}

export async function receiveWebDavAttachment(destination: AttachmentBlockDestination,
  body: AsyncIterable<Uint8Array>, auth: Auth, assertScope: () => Promise<void>) {
  const stream = await readFramedSyncStream(body);
  const { context, groupKey, signal } = auth;
  let first: AttachmentRequest | undefined;
  let last: AttachmentRequest | undefined;
  let resource: AttachmentBlockResource | undefined;
  let retained = 0;
  let next = 0;
  let ended = false;
  for await (const { message } of readRequestSyncWire({ context, groupKey, ...stream, ...(signal ? { signal } : {}) })) {
    if (ended || message.payloadCase !== 'request_attachment') throw new Error('webdav_relay_attachment_invalid');
    const block = attachmentRequestSchema.parse(message.payload);
    first ??= block;
    resource ??= attachmentBlockResourceSchema.parse(block);
    assertAttachmentResponse(block, first);
    if (block.operation !== 'pull' || block.byteLength !== first.byteLength || block.offset !== next) {
      throw new Error('webdav_relay_attachment_invalid');
    }
    if (block.state === 'end' && !block.data.length && next === block.byteLength) { ended = true; continue; }
    if (block.state !== 'block' || !block.data.length ||
        block.data.length !== Math.min(ATTACHMENT_BLOCK_BYTES, block.byteLength - next)) {
      throw new Error('webdav_relay_attachment_invalid');
    }
    next += block.data.length;
    if (next === block.byteLength) last = block;
    else if (next > retained) {
      if (!retained) retained = (await destination.status(resource)).offset;
      if (next > retained) retained = await applyBlock(destination, resource, block, retained);
    }
  }
  if (!resource || !ended) throw new Error('webdav_relay_attachment_incomplete');
  await assertScope();
  if (last) {
    if (!retained) retained = (await destination.status(resource)).offset;
    if (retained < resource.byteLength) await applyBlock(destination, resource, last, retained);
  } else await destination.status(resource);
  return resource.storageKey;
}

async function applyBlock(destination: AttachmentBlockDestination, resource: AttachmentBlockResource,
  block: AttachmentRequest, retained: number) {
  if (retained !== block.offset) throw new Error('webdav_relay_attachment_offset_changed');
  const received = await destination.receive(resource, block.offset, block.data);
  const expected = block.offset + block.data.length;
  if (received.offset !== expected || received.kind !== (expected === block.byteLength ? 'complete' : 'partial')) {
    throw new Error('webdav_relay_attachment_offset_changed');
  }
  return received.offset;
}
