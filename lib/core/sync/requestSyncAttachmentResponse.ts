import { ATTACHMENT_BLOCK_BYTES, attachmentBlockResourceSchema } from './attachmentBlockReceiver.js';
import type { AttachmentBlockDestination, AttachmentBlockSource } from './attachmentBlockTransfer.js';
import { AttachmentVerificationPending } from './attachmentSourceVerification.js';
import { attachmentWorkBudget } from './attachmentWorkBudget.js';
import type { FramedSyncStreamBody } from './framedSyncBinaryStream.js';
import { attachmentMessage, attachmentRequestSchema, type AttachmentRequest } from './requestSyncAttachmentContract.js';
import type { RequestSyncMessage } from './requestSyncObjectMessages.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from './requestSyncWire.js';

export interface RequestSyncAttachmentHost extends AttachmentBlockDestination, AttachmentBlockSource {
  needs(): Promise<string[]>;
  attempted?(storageKey: string): Promise<void>;
  derivePdfText?(pdfKey: string, version: number): Promise<string | null>;
  importPdfText?(pdfKey: string, artifactKey: string): Promise<void>;
  needsSlice(shouldYield: () => boolean): Promise<{ keys: string[]; pending: boolean; parsingPending?: boolean; pdfTextKeys?: string[] }>;
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
  const withSource: AttachmentBlockSource['withFile'] = (key, action) => {
    const budget = attachmentWorkBudget(250);
    return host.withFile(key, action, { shouldYield: () => { input.signal?.throwIfAborted(); return budget(); } });
  };
  if (request.derive) {
    if (request.operation !== 'describe' || !request.storageKey.endsWith('.pdf')) throw new Error('attachment_derivation_invalid');
    const selected = request;
    const key = await host.derivePdfText?.(selected.storageKey, selected.extractorVersion);
    if (!key) return reply((async function* () { yield attachmentMessage({ ...selected, state: 'end' }); })());
    return withPendingReply(() => withSource(key, file => reply((async function* () {
      yield attachmentMessage({ ...selected, storageKeys: [key], byteLength: file.resource.byteLength, state: 'complete' });
    })())), selected, reply);
  }
  if (request.operation === 'pull' || request.operation === 'describe') {
    const selected = request;
    return withPendingReply(() => withSource(selected.storageKey,
      file => reply(sourceMessages(selected, file, input.signal, input.onProgress))), selected, reply);
  }
  return reply(responseMessages(host, request));
}

async function withPendingReply<T>(execute: () => Promise<T>, request: AttachmentRequest,
  reply: (messages: AsyncIterable<RequestSyncMessage>) => Promise<T>) {
  try { return await execute(); }
  catch (error) {
    if (!(error instanceof AttachmentVerificationPending)) throw error;
    return reply((async function* () { yield attachmentMessage({ ...request, state: 'end', pending: true }); })());
  }
}

async function* responseMessages(host: RequestSyncAttachmentHost, request: AttachmentRequest) {
  if (request.operation === 'needs') {
    const demand = await host.needsSlice(attachmentWorkBudget());
    const needs = demand.keys;
    for (const key of needs) await host.attempted?.(key);
    for (let index = 0; index < needs.length; index += 256) {
      yield attachmentMessage({ ...request, storageKeys: needs.slice(index, index + 256), state: 'partial' });
    }
    yield attachmentMessage({ ...request, state: 'end', pending: demand.pending, parsingPending: demand.parsingPending ?? false });
    return;
  }
  const resource = attachmentBlockResourceSchema.parse(request);
  await host.attempted?.(resource.storageKey);
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
