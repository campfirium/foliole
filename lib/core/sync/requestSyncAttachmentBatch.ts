import { ATTACHMENT_BLOCK_BYTES, attachmentBlockResourceSchema } from './attachmentBlockReceiver.js';
import type { AttachmentSourceFile } from './attachmentBlockTransfer.js';
import { AttachmentVerificationPending } from './attachmentSourceVerification.js';
import { attachmentDataYield, attachmentWorkBudget } from './attachmentWorkBudget.js';
import type { FramedSyncStreamBody } from './framedSyncBinaryStream.js';
import { ATTACHMENT_BATCH_MAX_BYTES, ATTACHMENT_BATCH_MAX_FILES, ATTACHMENT_BATCH_MEMBER_BYTES, attachmentMessage, attachmentRequestSchema, type AttachmentRequest } from './requestSyncAttachmentContract.js';
import { sourceMessages, type RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import { prepareRequestSyncWire, readRequestSyncWire, type RequestSyncAuthenticatedContext } from './requestSyncWire.js';

type BatchInput = {
  context: RequestSyncAuthenticatedContext;
  groupKey: Uint8Array;
  stream: FramedSyncStreamBody;
  signal?: AbortSignal;
  onProgress?: () => void;
};

export async function respondAttachmentBatchDescriptions<T>(host: RequestSyncAttachmentHost,
  input: BatchInput, consume: (stream: FramedSyncStreamBody) => Promise<T>) {
  const requests = await readBatchRequests(input, 'describe');
  const reply = await prepareRequestSyncWire({ ...input, messages: async function* () {
    const shouldYield = attachmentWorkBudget(250);
    for (const request of requests) {
      input.signal?.throwIfAborted();
      yield attachmentMessage(shouldYield() ? { ...request, state: 'end', pending: true }
        : await describeMember(host, request, shouldYield));
    }
  } });
  try { return await consume(reply); }
  finally { await reply.frames.return(undefined); }
}

export async function respondAttachmentBatchPull<T>(host: RequestSyncAttachmentHost,
  input: BatchInput, consume: (stream: FramedSyncStreamBody, signal?: AbortSignal) => Promise<T>) {
  const requests = await readBatchRequests(input, 'pull');
  const shouldYield = attachmentDataYield();
  const reply = await prepareRequestSyncWire({ ...input, messages: async function* () {
    for (const request of requests) {
      input.signal?.throwIfAborted();
      if (shouldYield()) yield attachmentMessage({ ...request, state: 'end', pending: true });
      else yield* pullMember(host, request, input, shouldYield);
    }
  } });
  try { return await consume(reply, input.signal); }
  finally { await reply.frames.return(undefined); }
}

async function readBatchRequests(input: BatchInput, operation: 'describe' | 'pull') {
  const requests: AttachmentRequest[] = [];
  const keys = new Set<string>();
  let bytes = 0;
  for await (const { message } of readRequestSyncWire({ ...input, ...input.stream })) {
    if (message.payloadCase !== 'request_attachment' || requests.length >= ATTACHMENT_BATCH_MAX_FILES) {
      throw new Error('attachment_batch_request_invalid');
    }
    const request = attachmentRequestSchema.parse(message.payload);
    if (request.operation !== operation || request.derive || request.state || request.data.length ||
        request.storageKeys.length || request.pending || request.parsingPending ||
        !request.storageKey || keys.has(request.storageKey)) {
      throw new Error('attachment_batch_request_invalid');
    }
    if (operation === 'pull') {
      const remaining = request.byteLength - request.offset;
      bytes += remaining;
      if (remaining <= 0 || request.byteLength > ATTACHMENT_BATCH_MEMBER_BYTES || bytes > ATTACHMENT_BATCH_MAX_BYTES ||
          request.offset % ATTACHMENT_BLOCK_BYTES !== 0 || remaining > request.maxBlocks * ATTACHMENT_BLOCK_BYTES) {
        throw new Error('attachment_batch_range_invalid');
      }
    }
    keys.add(request.storageKey);
    requests.push(request);
  }
  if (!requests.length) throw new Error('attachment_batch_request_invalid');
  return requests;
}

async function describeMember(host: RequestSyncAttachmentHost, request: AttachmentRequest, shouldYield: () => boolean) {
  try {
    return await host.withFile(request.storageKey, async file => {
      const resource = attachmentBlockResourceSchema.parse(file.resource);
      if (resource.storageKey !== request.storageKey) throw new Error('attachment_batch_description_identity_invalid');
      return { ...request, byteLength: resource.byteLength, state: 'complete' as const };
    }, { describeSmallFile: true, shouldYield });
  } catch (error) {
    if (error instanceof AttachmentVerificationPending) return { ...request, state: 'end' as const, pending: true };
    if (sourceMissing(error)) return { ...request, state: 'end' as const };
    throw error;
  }
}


async function* pullMember(host: RequestSyncAttachmentHost, request: AttachmentRequest,
  input: BatchInput, shouldYield: () => boolean) {
  let open: (file: AttachmentSourceFile) => void = () => {};
  let fail: (error: unknown) => void = () => {};
  let release: () => void = () => {};
  const source = new Promise<AttachmentSourceFile>((resolve, reject) => { open = resolve; fail = reject; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const budget = attachmentWorkBudget(250);
  // Hold exactly one source lease until its frames are consumed or the response is closed.
  const worker = host.withFile(request.storageKey, async file => {
    open(file);
    await released;
  }, { shouldYield: () => {
    input.signal?.throwIfAborted();
    return shouldYield() || budget();
  } });
  void worker.catch(fail);
  try {
    let file;
    try { file = await source; }
    catch (error) {
      if (!sourceMissing(error) && !(error instanceof AttachmentVerificationPending)) throw error;
      yield attachmentMessage({ ...request, state: 'end', pending: error instanceof AttachmentVerificationPending });
      return;
    }
    if (file.resource.storageKey !== request.storageKey) throw new Error('attachment_batch_source_identity_invalid');
    if (shouldYield()) yield attachmentMessage({ ...request, state: 'end', pending: true });
    else yield* sourceMessages(request, file, input.signal, input.onProgress);
  } finally {
    release();
    // Source-open failures were handled by the source promise. A late close failure still fails the response.
    if (await source.then(() => true, () => false)) await worker;
  }
}

function sourceMissing(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
