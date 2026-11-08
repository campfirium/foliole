import { ATTACHMENT_BLOCK_BYTES } from './attachmentBlockReceiver.js';
import type { AttachmentBlockDestination } from './attachmentBlockTransfer.js';
import { ATTACHMENT_BATCH_DESCRIBE_OPERATION, ATTACHMENT_BATCH_PULL_OPERATION, assertAttachmentResponse, attachmentMessage, attachmentRequestSchema,
  type AttachmentRequest } from './requestSyncAttachmentContract.js';
import { withControlRequest, type RequestSyncExchange } from './requestSyncDatabaseExchange.js';
import { readRequestSyncWire } from './requestSyncWire.js';

export type AttachmentBatchMemberResult = { complete: boolean; offset: number; pending: boolean };

export async function describeAttachmentBatch(exchange: RequestSyncExchange, keys: readonly string[]) {
  const requestId = crypto.getRandomValues(new Uint8Array(16));
  const requests = keys.map(storageKey => attachmentRequestSchema.parse({ operation: 'describe', storageKey, requestId }));
  return withControlRequest(exchange, `/companion/framed-sync?request=${ATTACHMENT_BATCH_DESCRIBE_OPERATION}`,
    requests.map(attachmentMessage), async body => {
      const replies: AttachmentRequest[] = [];
      for await (const { message } of readRequestSyncWire({ ...exchange, ...body })) {
        const request = requests[replies.length];
        if (!request || message.payloadCase !== 'request_attachment') throw new Error('attachment_batch_response_invalid');
        const frame = attachmentRequestSchema.parse(message.payload);
        assertAttachmentResponse(frame, request);
        if ((frame.state !== 'complete' && frame.state !== 'end') || frame.data.length) {
          throw new Error('attachment_batch_description_invalid');
        }
        replies.push(frame);
      }
      if (replies.length !== requests.length) throw new Error('attachment_batch_response_incomplete');
      return replies;
    });
}

export async function pullAttachmentBatch(exchange: RequestSyncExchange, receiver: AttachmentBlockDestination,
  requests: readonly AttachmentRequest[], shouldYield: () => boolean,
  onMember: (request: AttachmentRequest, result: AttachmentBatchMemberResult) => void) {
  if (!requests.length || shouldYield()) return;
  if (exchange.receiveAttachmentBatch) {
    const receiveWindow = receiver.receiveWindow;
    if (!receiveWindow) throw new Error('attachment_window_receiver_missing');
    return exchange.receiveAttachmentBatch(requests, async (index, receive) => {
      const request = requests[index]!;
      let missing = false;
      const result = await receiveWindow(request, request.offset, async () => {
        const result = await receive();
        missing = !result.blocks && !result.pending && result.offset !== request.byteLength;
        return missing ? { ...result, pending: true } : result;
      });
      onMember(request, { ...result, pending: result.pending && !missing, complete: result.offset === request.byteLength });
    });
  }
  return withControlRequest(exchange, `/companion/framed-sync?request=${ATTACHMENT_BATCH_PULL_OPERATION}`,
    requests.map(attachmentMessage), async body => {
      let index = 0;
      let member = receiverMember(receiver, requests[index]!);
      for await (const { message } of readRequestSyncWire({ ...exchange, ...body })) {
        if (shouldYield()) return;
        const request = requests[index];
        if (!request || message.payloadCase !== 'request_attachment') throw new Error('attachment_batch_response_invalid');
        const frame = attachmentRequestSchema.parse(message.payload);
        assertAttachmentResponse(frame, request);
        const result = await member.accept(frame);
        if (result) {
          onMember(request, result);
          const next = requests[++index];
          if (next) member = receiverMember(receiver, next);
        }
      }
      if (index !== requests.length) throw new Error('attachment_batch_response_incomplete');
    });
}

function receiverMember(receiver: AttachmentBlockDestination, request: AttachmentRequest) {
  let offset = request.offset;
  let tail: AttachmentRequest | undefined;
  const apply = async (block: AttachmentRequest) => {
    const next = offset + block.data.length;
    const result = await receiver.receive(request, offset, block.data);
    if (result.offset !== next || result.kind !== (next === request.byteLength ? 'complete' : 'partial')) {
      throw new Error('attachment_batch_receiver_changed');
    }
    offset = next;
  };
  return { async accept(frame: AttachmentRequest): Promise<AttachmentBatchMemberResult | undefined> {
    if (frame.byteLength !== request.byteLength) throw new Error('attachment_batch_length_invalid');
    if (frame.state === 'block') {
      const expected = Math.min(ATTACHMENT_BLOCK_BYTES, request.byteLength - offset);
      if (tail || frame.offset !== offset || expected <= 0 || frame.data.length !== expected ||
          offset - request.offset >= request.maxBlocks * ATTACHMENT_BLOCK_BYTES) {
        throw new Error('attachment_batch_block_invalid');
      }
      // Hold only the final block until its authenticated member terminator arrives.
      if (offset + expected === request.byteLength) tail = frame;
      else await apply(frame);
      return undefined;
    }
    if (frame.state !== 'end' || frame.data.length || frame.offset !== offset + (tail?.data.length ?? 0) ||
        (tail && frame.pending)) throw new Error('attachment_batch_end_invalid');
    if (tail) await apply(tail);
    return { complete: offset === request.byteLength, offset, pending: frame.pending };
  } };
}
