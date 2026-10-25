import { ATTACHMENT_BLOCK_BYTES, type AttachmentBlockResource } from './attachmentBlockReceiver.js';
import { AttachmentReceivePaused } from './attachmentBlockTransfer.js';
import { ATTACHMENT_WINDOW_BLOCKS, attachmentRequestSchema } from './requestSyncAttachmentContract.js';
import type { RequestSyncAttachmentHost } from './requestSyncAttachmentResponse.js';
import type { RequestSyncExchange, PreparedAttachmentRequest } from './requestSyncDatabaseExchange.js';

export type AttachmentPreparation = Awaited<ReturnType<typeof import('./requestSyncAttachmentPull.js').prepareRequestSyncAttachment>>;
type Settled = { kind: 'ready'; window: PreparedAttachmentRequest } | { kind: 'failed'; error: unknown };

export function prepareAttachmentWindow(exchange: RequestSyncExchange, resource: AttachmentBlockResource, offset: number) {
  if (!exchange.prepareAttachment) throw new Error('native_request_preparation_required');
  return exchange.prepareAttachment(attachmentRequestSchema.parse({ ...resource,
    requestId: crypto.getRandomValues(new Uint8Array(16)), operation: 'pull', offset, maxBlocks: ATTACHMENT_WINDOW_BLOCKS }));
}

export async function pullPreparedAttachmentWindows(host: RequestSyncAttachmentHost, exchange: RequestSyncExchange,
  ready: NonNullable<AttachmentPreparation>, shouldYield: () => boolean, onDispatch: (hasNext: boolean) => void) {
  if (!host.receiveWindow) throw new Error('attachment_window_receiver_missing');
  const resource = ready.resource;
  let offset = ready.initial.offset, blocks = 0;
  let current = ready.window;
  let next: Promise<Settled> | undefined;
  try {
    while (true) {
      exchange.signal?.throwIfAborted();
      if (shouldYield()) return { complete: false, blocks };
      current ??= await prepareAttachmentWindow(exchange, resource, offset);
      const active = current;
      const planned = Math.min(resource.byteLength, offset + ATTACHMENT_WINDOW_BLOCKS * ATTACHMENT_BLOCK_BYTES);
      let result;
      try {
        result = await host.receiveWindow(resource, offset, () => {
          const operation = active.send();
          if (planned < resource.byteLength && !shouldYield()) next = settle(prepareAttachmentWindow(exchange, resource, planned));
          onDispatch(Boolean(next));
          return operation;
        });
      } catch (error) {
        if (!(error instanceof AttachmentReceivePaused)) throw error;
        await host.status(resource);
        return { complete: false, blocks };
      } finally { await active.close(); current = undefined; }
      blocks += result.blocks;
      offset = result.offset;
      if (offset === resource.byteLength) return { complete: true, blocks };
      if (!result.blocks) return { complete: false, blocks, verificationPending: true };
      if (shouldYield()) return { complete: false, blocks };
      if (next && offset === planned) {
        const prepared = await next; next = undefined;
        if (prepared.kind === 'failed') throw prepared.error;
        current = prepared.window;
      } else { await closeSettled(next); next = undefined; }
    }
  } finally { await current?.close(); await closeSettled(next); }
}

function settle(promise: Promise<PreparedAttachmentRequest>): Promise<Settled> {
  return promise.then(window => ({ kind: 'ready', window }), (error: unknown) => ({ kind: 'failed', error }));
}
async function closeSettled(promise?: Promise<Settled>) {
  const result = await promise;
  if (result?.kind === 'ready') await result.window.close();
}
