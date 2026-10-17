import { ATTACHMENT_BLOCK_BYTES, type AttachmentBlockResource, type AttachmentBlockResult,
  type AttachmentBlockStatus } from './attachmentBlockReceiver.js';
import { attachmentWorkBudget } from './attachmentWorkBudget.js';

export interface AttachmentBlockDestination {
  status(resource: AttachmentBlockResource): Promise<AttachmentBlockStatus>;
  receive(resource: AttachmentBlockResource, offset: number, bytes: Uint8Array): Promise<AttachmentBlockResult>;
}

/** Sources keep their send lease until this callback and its network writes settle. */
export interface AttachmentBlockSource {
  withFile<T>(storageKey: string, consume: (file: {
    resource: AttachmentBlockResource;
    read(offset: number, length: number): Promise<Uint8Array>;
  }) => Promise<T>, options?: { shouldYield: () => boolean }): Promise<T>;
}

export async function transferAttachmentSlice(input: {
  storageKey: string; source: AttachmentBlockSource; destination: AttachmentBlockDestination; signal?: AbortSignal; maxBlocks?: number; shouldYield?: () => boolean;
}) {
  const verificationBudget = attachmentWorkBudget(250);
  return input.source.withFile(input.storageKey, async file => {
    let current = await input.destination.status(file.resource);
    let blocks = 0;
    while (current.kind !== 'complete' && blocks < (input.maxBlocks ?? 1) && (!blocks || !input.shouldYield?.())) {
      input.signal?.throwIfAborted();
      const offset = current.offset;
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= file.resource.byteLength ||
          offset % ATTACHMENT_BLOCK_BYTES !== 0) throw new Error('attachment_receiver_offset_invalid');
      const length = Math.min(ATTACHMENT_BLOCK_BYTES, file.resource.byteLength - offset);
      const bytes = await file.read(offset, length);
      if (bytes.byteLength !== length) throw new Error('attachment_source_truncated');
      let next: AttachmentBlockResult;
      try { next = await input.destination.receive(file.resource, offset, bytes); }
      catch (error) {
        input.signal?.throwIfAborted();
        next = await input.destination.status(file.resource);
        if (next.kind !== 'complete' && next.offset <= offset) throw error;
      }
      if (next.offset <= offset) throw new Error('attachment_transfer_no_progress');
      current = next.kind === 'offset' ? await input.destination.status(file.resource) : next;
      blocks++;
    }
    if (current.kind === 'complete' && current.offset !== file.resource.byteLength) throw new Error('attachment_receiver_length_invalid');
    return { resource: file.resource, complete: current.kind === 'complete', blocks };
  }, input.shouldYield ? { shouldYield: () => {
    input.signal?.throwIfAborted();
    return verificationBudget() || input.shouldYield!();
  } } : undefined);
}

export async function transferAttachmentBlocks(input: Parameters<typeof transferAttachmentSlice>[0]) {
  return (await transferAttachmentSlice({ ...input, maxBlocks: Infinity })).resource;
}

/** Each endpoint derives current needs afresh; the initiator carries bytes in both directions. */
export async function exchangeAttachmentBlocks(input: {
  local: AttachmentBlockSource & AttachmentBlockDestination;
  remote: AttachmentBlockSource & AttachmentBlockDestination;
  localNeeds: Iterable<string> | AsyncIterable<string>;
  remoteNeeds: Iterable<string> | AsyncIterable<string>;
  signal?: AbortSignal;
}) {
  let received = 0;
  let sent = 0;
  for await (const storageKey of input.localNeeds) {
    await transferAttachmentBlocks({ ...input, storageKey, source: input.remote, destination: input.local });
    received++;
  }
  for await (const storageKey of input.remoteNeeds) {
    await transferAttachmentBlocks({ ...input, storageKey, source: input.local, destination: input.remote });
    sent++;
  }
  return { received, sent };
}
