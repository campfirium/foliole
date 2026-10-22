import { ATTACHMENT_BLOCK_BYTES, type AttachmentBlockResource, type AttachmentBlockResult } from './attachmentBlockReceiver.js';
import { attachmentWorkBudget } from './attachmentWorkBudget.js';
import { ATTACHMENT_WINDOW_BLOCKS, type AttachmentRequest } from './requestSyncAttachmentContract.js';
import { singleAttachmentRequest } from './requestSyncAttachmentPull.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import type { RequestSyncExchange } from './requestSyncDatabaseExchange.js';

function receiveResult(message: AttachmentRequest): AttachmentBlockResult {
  if (message.state !== 'partial' && message.state !== 'complete' && message.state !== 'offset') {
    throw new Error('attachment_receiver_state_invalid');
  }
  return { kind: message.state, offset: message.offset };
}

async function status(exchange: RequestSyncExchange, resource: AttachmentBlockResource) {
  const result = receiveResult(await singleAttachmentRequest(exchange, { ...resource, operation: 'status' }));
  if (result.kind === 'offset') throw new Error('attachment_status_invalid');
  return result;
}

async function readWindow(file: { resource: AttachmentBlockResource; read(offset: number, length: number): Promise<Uint8Array> },
  start: number, maxBlocks: number) {
  const { byteLength } = file.resource;
  if (!Number.isSafeInteger(start) || start < 0 || start >= byteLength || start % ATTACHMENT_BLOCK_BYTES !== 0) {
    throw new Error('attachment_receiver_offset_invalid');
  }
  const blocks = [];
  for (let offset = start; offset < byteLength && blocks.length < maxBlocks; offset += ATTACHMENT_BLOCK_BYTES) {
    const length = Math.min(ATTACHMENT_BLOCK_BYTES, byteLength - offset);
    const data = await file.read(offset, length);
    if (data.byteLength !== length) throw new Error('attachment_source_truncated');
    blocks.push({ ...file.resource, operation: 'push' as const, offset, data });
  }
  return blocks;
}

/** Push consecutive windows under the source lease until the peer holds the file or data work needs the peer. */
export async function pushRequestSyncAttachmentWindows(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange,
  storageKey: string, shouldYield: () => boolean) {
  const verificationBudget = attachmentWorkBudget(250);
  return host.withFile(storageKey, async file => {
    let current = await status(exchange, file.resource);
    let blocks = 0;
    while (current.kind !== 'complete' && (!blocks || !shouldYield())) {
      exchange.signal?.throwIfAborted();
      const offset = current.offset;
      // While data work waits, the minimum share is a single block, as for pulls.
      const window = await readWindow(file, offset, shouldYield() ? 1 : ATTACHMENT_WINDOW_BLOCKS);
      let next: AttachmentBlockResult;
      try { next = receiveResult(await singleAttachmentRequest(exchange, window)); }
      catch (error) {
        exchange.signal?.throwIfAborted();
        next = await status(exchange, file.resource);
        if (next.kind !== 'complete' && next.offset <= offset) throw error;
      }
      if (next.offset <= offset) throw new Error('attachment_transfer_no_progress');
      blocks += Math.ceil((next.offset - offset) / ATTACHMENT_BLOCK_BYTES);
      current = next.kind === 'offset' ? await status(exchange, file.resource) : next;
    }
    if (current.kind === 'complete' && current.offset !== file.resource.byteLength) throw new Error('attachment_receiver_length_invalid');
    return { complete: current.kind === 'complete', blocks };
  }, { shouldYield: () => {
    exchange.signal?.throwIfAborted();
    return verificationBudget() || shouldYield();
  } });
}
