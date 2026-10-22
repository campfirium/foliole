import { ATTACHMENT_BLOCK_BYTES, attachmentBlockResourceSchema, type AttachmentBlockResource } from './attachmentBlockReceiver.js';
import { ATTACHMENT_WINDOW_BLOCKS, attachmentMessage, attachmentRequestSchema, assertAttachmentResponse,
  type AttachmentRequest } from './requestSyncAttachmentContract.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import { withControlRequest, type RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import { readRequestSyncWire } from './requestSyncWire.js';

// Each describe advances the source scan by one bounded slice; a scan this long is left for a later pass.
const DESCRIBE_ATTEMPTS = 64;

type AttachmentQuery = Partial<AttachmentRequest> & Pick<AttachmentRequest, 'operation'>;

/** Several inputs form one push window under a shared request ID; the reply answers the first. */
export async function attachmentRequest(exchange: RequestSyncExchange, input: AttachmentQuery | AttachmentQuery[],
  consume: (message: AttachmentRequest) => Promise<void>) {
  const requestId = crypto.getRandomValues(new Uint8Array(16));
  const queries = (Array.isArray(input) ? input : [input]).map(item => attachmentRequestSchema.parse({ requestId, ...item }));
  const query = queries[0]!;
  return withControlRequest(exchange, '/companion/framed-sync?request=attachments', queries.map(item => attachmentMessage(item)), async response => {
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

export async function singleAttachmentRequest(exchange: RequestSyncExchange, input: Parameters<typeof attachmentRequest>[1]) {
  let result: AttachmentRequest | undefined;
  await attachmentRequest(exchange, input, async message => { result = message; });
  return result!;
}

async function describe(exchange: RequestSyncExchange, storageKey: string, shouldYield: () => boolean) {
  for (let attempt = 1; ; attempt++) {
    const description = await singleAttachmentRequest(exchange, { operation: 'describe', storageKey });
    if (description.state === 'end' && description.pending) {
      if (attempt >= DESCRIBE_ATTEMPTS || shouldYield()) return null;
      continue;
    }
    if (description.state !== 'complete') throw new Error('attachment_description_invalid');
    return attachmentBlockResourceSchema.parse(description);
  }
}

async function pullWindow(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange,
  resource: AttachmentBlockResource, start: number, shouldYield: () => boolean) {
  let blocks = 0;
  let wireBlocks = 0;
  let offset = start;
  let receivedOffset = start;
  let paused = false;
  await attachmentRequest(exchange, { ...resource, operation: 'pull', offset, maxBlocks: ATTACHMENT_WINDOW_BLOCKS }, async message => {
    if (message.byteLength !== resource.byteLength || message.offset !== offset) throw new Error('attachment_pull_offset_invalid');
    if (message.state === 'end') {
      if (!wireBlocks && !message.pending && offset !== resource.byteLength) throw new Error('attachment_pull_incomplete');
    } else if (message.state === 'block') {
      if (wireBlocks >= ATTACHMENT_WINDOW_BLOCKS || message.data.length !== Math.min(ATTACHMENT_BLOCK_BYTES, resource.byteLength - offset)) {
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
  return { blocks, wireBlocks, receivedOffset };
}

/** Describe once, then pull consecutive windows until the file completes or data work needs the peer. */
export async function pullRequestSyncAttachmentWindows(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange,
  storageKey: string, shouldYield: () => boolean) {
  const resource = await describe(exchange, storageKey, shouldYield);
  if (!resource) return { complete: false, blocks: 0, verificationPending: true };
  const initial = await host.status(resource);
  if (initial.kind === 'complete') return { complete: true, blocks: 0 };
  let blocks = 0;
  let offset = initial.offset;
  while (true) {
    const window = await pullWindow(host, exchange, resource, offset, shouldYield);
    blocks += window.blocks;
    offset = window.receivedOffset;
    if (offset === resource.byteLength) return { complete: true, blocks };
    if (!window.wireBlocks) return { complete: false, blocks, verificationPending: true };
    if (shouldYield()) return { complete: false, blocks };
  }
}
