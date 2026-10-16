import { ATTACHMENT_BLOCK_BYTES, attachmentBlockResourceSchema, type AttachmentBlockResult } from './attachmentBlockReceiver.js';
import { transferAttachmentSlice } from './attachmentBlockTransfer.js';
import { attachmentWorkBudget, hasWaitingSyncData } from './attachmentWorkBudget.js';
import { PDF_TEXT_EXTRACTOR_VERSION } from './pdfTextArtifact.js';
import { attachmentMessage, attachmentRequestSchema, assertAttachmentResponse,
  type AttachmentRequest } from './requestSyncAttachmentContract.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import { withControlRequest, type RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import { exchangePdfTextArtifacts } from './requestSyncPdfText.js';
import { readRequestSyncWire } from './requestSyncWire.js';

async function request(exchange: RequestSyncExchange, input: Partial<AttachmentRequest> &
  Pick<AttachmentRequest, 'operation'>, consume: (message: AttachmentRequest) => Promise<void>) {
  const query = attachmentRequestSchema.parse({ requestId: crypto.getRandomValues(new Uint8Array(16)), ...input });
  return withControlRequest(exchange, '/companion/framed-sync?request=attachments', [attachmentMessage(query)], async response => {
    let count = 0;
    let ended = false;
    for await (const decoded of readRequestSyncWire({ ...exchange, ...response })) {
      if (ended || decoded.message.payloadCase !== 'request_attachment') throw new Error('attachment_response_invalid');
      const message = attachmentRequestSchema.parse(decoded.message.payload);
      assertAttachmentResponse(message, query);
      await consume(message);
      count++;
      ended = message.state === 'end' || !['needs', 'pull'].includes(query.operation);
    }
    if (!count || !ended) throw new Error('attachment_response_incomplete');
  });
}

async function single(exchange: RequestSyncExchange, input: Parameters<typeof request>[1]) {
  let result: AttachmentRequest | undefined;
  await request(exchange, input, async message => { result = message; });
  return result!;
}

function receiveResult(message: AttachmentRequest): AttachmentBlockResult {
  if (message.state !== 'partial' && message.state !== 'complete' && message.state !== 'offset') {
    throw new Error('attachment_receiver_state_invalid');
  }
  return { kind: message.state, offset: message.offset };
}

async function pullSlice(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange, storageKey: string, maxBlocks = 8, shouldYield = () => false) {
  const description = await single(exchange, { operation: 'describe', storageKey });
  if (description.state !== 'complete') throw new Error('attachment_description_invalid');
  const resource = attachmentBlockResourceSchema.parse(description);
  const initial = await host.status(resource);
  if (initial.kind === 'complete') return { complete: true, blocks: 0 };
  let blocks = 0;
  let wireBlocks = 0;
  let offset = initial.offset;
  let receivedOffset = initial.offset;
  let paused = false;
  await request(exchange, { ...resource, operation: 'pull', offset, maxBlocks }, async message => {
    if (message.byteLength !== resource.byteLength || message.offset !== offset) throw new Error('attachment_pull_offset_invalid');
    if (message.state === 'end') {
      if (!wireBlocks && offset !== resource.byteLength) throw new Error('attachment_pull_incomplete');
    } else if (message.state === 'block') {
      if (wireBlocks >= maxBlocks || message.data.length !== Math.min(ATTACHMENT_BLOCK_BYTES, resource.byteLength - offset)) {
        throw new Error('attachment_pull_block_limit_invalid');
      }
      if (!paused) {
        const result = await host.receive(resource, offset, message.data);
        if (result.kind === 'offset' || result.offset !== offset + message.data.length) {
          throw new Error('attachment_pull_receiver_changed');
        }
        receivedOffset = result.offset;
        blocks++;
        paused = shouldYield();
      }
      // Authenticate and drain the bounded response; uncommitted blocks resume from receivedOffset.
      offset += message.data.length;
      wireBlocks++;
    } else throw new Error('attachment_pull_state_invalid');
  });
  return { complete: receivedOffset === resource.byteLength, blocks };
}

export async function pullRequestSyncAttachment(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange, storageKey: string) {
  while (!(await pullSlice(host, exchange, storageKey)).complete) exchange.signal?.throwIfAborted();
}

async function pullBudgeted(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange,
  key: string, shouldYield: () => boolean) {
  let blocks = 0; let slice;
  do {
    slice = await pullSlice(host, exchange, key, shouldYield() ? 1 : 8, shouldYield);
    blocks += slice.blocks;
  } while (!slice.complete && !shouldYield());
  return { complete: slice.complete, blocks };
}

/** Reuse one demand list while streaming; yield only at recoverable boundaries. */
export async function exchangeRequestSyncAttachments(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange,
  report: (storageKey: string, error: unknown) => void, shouldYield = attachmentWorkBudget()) {
  exchange.signal?.throwIfAborted();
  if (hasWaitingSyncData()) return { transferred: 0, blocks: 0, pending: null, yielded: true };
  const remoteNeeds = new Set<string>();
  let pendingScan = false;
  await request(exchange, { operation: 'needs' }, async message => {
    if (message.state !== 'partial' && message.state !== 'end') throw new Error('attachment_needs_invalid');
    for (const key of message.storageKeys) remoteNeeds.add(key);
    pendingScan ||= message.pending;
  });
  if (pendingScan) return { transferred: 0, blocks: 0, pending: null, yielded: true };
  const local = await host.needsSlice(shouldYield);
  if (local.pending) return { transferred: 0, blocks: 0, pending: null, yielded: true };
  const result = { transferred: 0, blocks: 0 };
  const pendingKeys = new Set<string>();
  const attempt = async (key: string, execute: () => Promise<{ complete: boolean; blocks: number }>) => {
    exchange.signal?.throwIfAborted();
    try {
      const slice = await execute();
      result.blocks += slice.blocks;
      if (slice.complete) result.transferred++;
      else pendingKeys.add(key);
    }
    catch (error) { exchange.signal?.throwIfAborted(); pendingKeys.add(key); report(key, error); }
  };
  // Reserve half the time for each direction when both have work.
  const pullBudget = attachmentWorkBudget(remoteNeeds.size ? 1000 : 2000);
  for (const key of local.keys) {
    if (result.blocks && (shouldYield() || pullBudget())) { pendingKeys.add(key); continue; }
    await attempt(key, () => pullBudgeted(host, exchange, key, () => shouldYield() || pullBudget()));
  }
  const text = await exchangePdfTextArtifacts({ host, ...(exchange.signal ? { signal: exchange.signal } : {}), keys: local.pdfTextKeys ?? [], shouldYield, report,
    describe: storageKey => single(exchange, { operation: 'describe', storageKey, derive: 'pdf_text',
      extractorVersion: PDF_TEXT_EXTRACTOR_VERSION }),
    pull: key => pullBudgeted(host, exchange, key, shouldYield) });
  result.blocks += text.blocks;
  result.transferred += text.transferred;
  const pulledBlocks = result.blocks;
  for (const key of remoteNeeds) {
    if (result.blocks > pulledBlocks && shouldYield()) { pendingKeys.add(key); continue; }
    await attempt(key, () => transferAttachmentSlice({ storageKey: key, source: host,
      maxBlocks: Infinity, shouldYield,
      ...(exchange.signal ? { signal: exchange.signal } : {}), destination: {
        async status(resource) {
          const result = receiveResult(await single(exchange, { ...resource, operation: 'status' }));
          if (result.kind === 'offset') throw new Error('attachment_status_invalid');
          return result;
        },
        async receive(resource, offset, data) {
          return receiveResult(await single(exchange, { ...resource, operation: 'push', offset, data }));
        }
      } }));
  }
  return { ...result, pending: pendingKeys.size + text.pending, yielded: pendingKeys.size > 0 && shouldYield() };
}
