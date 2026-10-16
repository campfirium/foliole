import { ATTACHMENT_BLOCK_BYTES, attachmentBlockResourceSchema, type AttachmentBlockResult } from './attachmentBlockReceiver.js';
import { transferAttachmentSlice } from './attachmentBlockTransfer.js';
import { attachmentMessage, attachmentRequestSchema, assertAttachmentResponse,
  type AttachmentRequest } from './requestSyncAttachmentContract.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import { withControlRequest, type RequestSyncExchange } from './requestSyncDatabaseExchange.js';
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

async function pullSlice(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange, storageKey: string) {
  const description = await single(exchange, { operation: 'describe', storageKey });
  if (description.state !== 'complete') throw new Error('attachment_description_invalid');
  const resource = attachmentBlockResourceSchema.parse(description);
  const initial = await host.status(resource);
  if (initial.kind === 'complete') return { complete: true, blocks: 0 };
  let blocks = 0;
  let offset = initial.offset;
  await request(exchange, { ...resource, operation: 'pull', offset }, async message => {
    if (message.byteLength !== resource.byteLength || message.offset !== offset) throw new Error('attachment_pull_offset_invalid');
    if (message.state === 'end') {
      if (offset !== Math.min(initial.offset + ATTACHMENT_BLOCK_BYTES, resource.byteLength)) throw new Error('attachment_pull_incomplete');
    } else if (message.state === 'block') {
      if (blocks || message.data.length !== Math.min(ATTACHMENT_BLOCK_BYTES, resource.byteLength - offset)) {
        throw new Error('attachment_pull_block_limit_invalid');
      }
      const result = await host.receive(resource, offset, message.data);
      if (result.kind === 'offset' || result.offset !== offset + message.data.length) {
        throw new Error('attachment_pull_receiver_changed');
      }
      offset = result.offset;
      blocks++;
    } else throw new Error('attachment_pull_state_invalid');
  });
  return { complete: offset === resource.byteLength, blocks };
}

export async function pullRequestSyncAttachment(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange, storageKey: string) {
  while (!(await pullSlice(host, exchange, storageKey)).complete) exchange.signal?.throwIfAborted();
}

/** No persistent demands or delivery records: failures are reported and needs are rebuilt next round. */
export async function exchangeRequestSyncAttachments(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange,
  report: (storageKey: string, error: unknown) => void) {
  const remoteNeeds = new Set<string>();
  await request(exchange, { operation: 'needs' }, async message => {
    if (message.state !== 'partial' && message.state !== 'end') throw new Error('attachment_needs_invalid');
    for (const key of message.storageKeys) remoteNeeds.add(key);
  });
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
  const localNeeds = await host.needs();
  for (const key of localNeeds) {
    if (result.blocks) pendingKeys.add(key);
    else await attempt(key, () => pullSlice(host, exchange, key));
  }
  const pulledBlocks = result.blocks;
  for (const key of remoteNeeds) {
    if (result.blocks > pulledBlocks) { pendingKeys.add(key); continue; }
    await attempt(key, () => transferAttachmentSlice({ storageKey: key, source: host,
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
  return { ...result, pending: pendingKeys.size };
}
