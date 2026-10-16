import { ATTACHMENT_BLOCK_BYTES, attachmentBlockResourceSchema } from './attachmentBlockReceiver.js';
import type { AttachmentBlockDestination, AttachmentBlockSource } from './attachmentBlockTransfer.js';
import { attachmentWorkBudget } from './attachmentWorkBudget.js';
import type { FramedSyncStreamBody } from './framedSyncBinaryStream.js';
import { attachmentMessage, attachmentRequestSchema, type AttachmentRequest } from './requestSyncAttachmentContract.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from './requestSyncWire.js';

export interface RequestSyncAttachmentHost extends AttachmentBlockDestination, AttachmentBlockSource {
  needs(): Promise<string[]>;
  needsSlice(shouldYield: () => boolean): Promise<{ keys: string[]; pending: boolean }>;
}

export async function respondRequestSyncAttachments<T>(host: RequestSyncAttachmentHost, input: {
  context: RequestSyncAuthenticatedContext; groupKey: Uint8Array; stream: FramedSyncStreamBody; signal?: AbortSignal;
  onProgress?: () => void;
}, consume: (stream: FramedSyncStreamBody) => Promise<T>) {
  let request: AttachmentRequest | undefined;
  for await (const decoded of readRequestSyncWire({ ...input, ...input.stream })) {
    if (request || decoded.message.payloadCase !== 'request_attachment') throw new Error('attachment_request_invalid');
    request = attachmentRequestSchema.parse(decoded.message.payload);
  }
  if (!request || request.state !== '') throw new Error('attachment_request_missing');
  const reply = async (messages: AsyncIterable<RequestSyncMessage>) => {
    const stream = await prepareRequestSyncWire({ ...input, messages: () => messages });
    try { return await consume(stream); }
    finally { await stream.frames.return(undefined); }
  };
  if (request.operation === 'pull' || request.operation === 'describe') {
    const selected = request;
    return host.withFile(selected.storageKey, file => reply(sourceMessages(selected, file, input.signal, input.onProgress)));
  }
  return reply(responseMessages(host, request));
}

async function* responseMessages(host: RequestSyncAttachmentHost, request: AttachmentRequest) {
  if (request.operation === 'needs') {
    const demand = await host.needsSlice(attachmentWorkBudget());
    const needs = demand.keys;
    for (let index = 0; index < needs.length; index += 256) {
      yield attachmentMessage({ ...request, storageKeys: needs.slice(index, index + 256), state: 'partial' });
    }
    yield attachmentMessage({ ...request, state: 'end', pending: demand.pending });
    return;
  }
  const resource = attachmentBlockResourceSchema.parse(request);
  const result = request.operation === 'status' ? await host.status(resource)
    : await host.receive(resource, request.offset, request.data);
  yield attachmentMessage({ ...request, data: new Uint8Array(), state: result.kind, offset: result.offset });
}

async function* sourceMessages(request: AttachmentRequest,
  file: Parameters<Parameters<AttachmentBlockSource['withFile']>[1]>[0], signal?: AbortSignal, onProgress?: () => void) {
  if (request.operation === 'describe') {
    yield attachmentMessage({ ...request, ...file.resource, state: 'complete' });
    return;
  }
  if (request.byteLength !== file.resource.byteLength || request.offset > file.resource.byteLength ||
      request.offset % ATTACHMENT_BLOCK_BYTES !== 0) throw new Error('attachment_pull_range_invalid');
  const end = Math.min(request.offset + ATTACHMENT_BLOCK_BYTES * request.maxBlocks, file.resource.byteLength);
  const shouldYield = attachmentWorkBudget(250);
  let sentEnd = request.offset;
  for (let offset = request.offset; offset < end; offset += ATTACHMENT_BLOCK_BYTES) {
    if (offset > request.offset && shouldYield()) break;
    signal?.throwIfAborted();
    onProgress?.();
    const data = await file.read(offset, Math.min(ATTACHMENT_BLOCK_BYTES, file.resource.byteLength - offset));
    onProgress?.();
    sentEnd = offset + data.length;
    yield attachmentMessage({ ...request, offset, data, state: 'block' });
  }
  yield attachmentMessage({ ...request, offset: sentEnd, state: 'end' });
}
