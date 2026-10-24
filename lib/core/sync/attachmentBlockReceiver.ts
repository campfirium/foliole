import { z } from 'zod';

import type { AttachmentReceiveOperation } from './attachmentBlockTransfer.js';

export const ATTACHMENT_BLOCK_BYTES = 512 * 1024;
export const attachmentBlockResourceSchema = z.object({
  storageKey: z.string().regex(/^[a-f0-9]{64}\.(png|jpg|gif|webp|pdf|epub|pdftext)$/u),
  byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
});
export type AttachmentBlockResource = z.infer<typeof attachmentBlockResourceSchema>;
export type AttachmentBlockStatus = { kind: 'partial' | 'complete'; offset: number };
export type AttachmentBlockResult = AttachmentBlockStatus | { kind: 'offset'; offset: number };

/** The host holds the library receiver owner throughout this port's lifetime. */
export interface AttachmentBlockFiles {
  exclusive<T>(hash: string, execute: () => Promise<T>): Promise<T>;
  complete(resource: AttachmentBlockResource): Promise<boolean>;
  partialLength(hash: string): Promise<number>;
  truncate(hash: string, length: number): Promise<void>;
  append(hash: string, offset: number, bytes: Uint8Array): Promise<void>;
  verifyPartial(hash: string): Promise<boolean>;
  discardPartial(hash: string): Promise<void>;
  publish(resource: AttachmentBlockResource): Promise<void>;
  availability(hash: string, available: boolean): Promise<void>;
}

export function createAttachmentBlockReceiver(files: AttachmentBlockFiles) {
  const recovered = new Set<string>();
  const availability = availabilityRecorder(files);

  const finish = (resource: AttachmentBlockResource) => publishComplete({ files, resource, recovered, availability });

  async function status(resource: AttachmentBlockResource): Promise<AttachmentBlockStatus> {
    const hash = resource.storageKey.slice(0, 64);
    if (await files.complete(resource)) {
      recovered.delete(hash);
      await availability(hash, true);
      return { kind: 'complete', offset: resource.byteLength };
    }
    await availability(hash, false);
    let offset = await files.partialLength(hash);
    if (!recovered.has(hash)) {
      offset = Math.max(0, Math.floor(Math.min(offset, resource.byteLength) / ATTACHMENT_BLOCK_BYTES)
        * ATTACHMENT_BLOCK_BYTES - ATTACHMENT_BLOCK_BYTES);
      await files.truncate(hash, offset);
      recovered.add(hash);
    }
    if (resource.byteLength === 0) return finish(resource);
    return { kind: 'partial', offset };
  }

  async function receive(resource: AttachmentBlockResource, offset: number,
    bytes: Uint8Array): Promise<AttachmentBlockResult> {
    const current = await status(resource);
    if (current.kind === 'complete') return current;
    if (current.offset !== offset) return { kind: 'offset', offset: current.offset };
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= resource.byteLength ||
      bytes.byteLength !== Math.min(ATTACHMENT_BLOCK_BYTES, resource.byteLength - offset)) {
      throw new Error('attachment_block_range_invalid');
    }
    await files.append(resource.storageKey.slice(0, 64), offset, bytes);
    const next = offset + bytes.byteLength;
    return next === resource.byteLength ? finish(resource) : { kind: 'partial', offset: next };
  }

  function run<T>(input: AttachmentBlockResource, execute: (resource: AttachmentBlockResource) => Promise<T>) {
    const resource = attachmentBlockResourceSchema.parse(input);
    const hash = resource.storageKey.slice(0, 64);
    return files.exclusive(hash, async () => {
      try { return await execute(resource); }
      catch (error) { recovered.delete(hash); throw error; }
    });
  }

  return {
    receiveWindow: (resource: AttachmentBlockResource, offset: number, execute: AttachmentReceiveOperation) =>
      run(resource, parsed => applyWindow({ files, resource: parsed, offset, execute, status, finish })),
    status: (resource: AttachmentBlockResource) => run(resource, status),
    receive: (resource: AttachmentBlockResource, offset: number, bytes: Uint8Array) =>
      run(resource, parsed => receive(parsed, offset, bytes))
  };
}

function availabilityRecorder(files: Pick<AttachmentBlockFiles, 'availability'>) {
  const recorded = new Map<string, boolean>();
  return async (hash: string, available: boolean) => {
    if (recorded.get(hash) === available) return;
    await files.availability(hash, available);
    recorded.set(hash, available);
  };
}

async function applyWindow(input: {
  files: AttachmentBlockFiles; resource: AttachmentBlockResource; offset: number; execute: AttachmentReceiveOperation;
  status(resource: AttachmentBlockResource): Promise<AttachmentBlockStatus>;
  finish(resource: AttachmentBlockResource): Promise<AttachmentBlockStatus>;
}) {
  const { files, resource, offset, execute } = input;
  const current = await input.status(resource);
  if (current.kind === 'complete') return { offset: current.offset, blocks: 0, pending: false };
  if (current.offset !== offset) throw new Error('attachment_pull_receiver_changed');
  const result = await execute();
  const expected = Math.min(resource.byteLength, offset + result.blocks * ATTACHMENT_BLOCK_BYTES);
  if (!Number.isInteger(result.blocks) || result.blocks < 0 || result.blocks > 64 || result.offset !== expected ||
      (!result.blocks && !result.pending && result.offset !== resource.byteLength) ||
      await files.partialLength(resource.storageKey.slice(0, 64)) !== result.offset) throw new Error('attachment_window_result_invalid');
  if (result.offset === resource.byteLength) await input.finish(resource);
  return result;
}

async function publishComplete(input: {
  files: AttachmentBlockFiles; resource: AttachmentBlockResource; recovered: Set<string>;
  availability: AttachmentBlockFiles['availability'];
}): Promise<AttachmentBlockStatus> {
  const { files, resource, recovered, availability } = input;
  const hash = resource.storageKey.slice(0, 64);
  if (!await files.verifyPartial(hash)) {
    await files.discardPartial(hash);
    throw new Error('attachment_checksum_mismatch');
  }
  await files.publish(resource);
  recovered.delete(hash);
  await availability(hash, true);
  return { kind: 'complete', offset: resource.byteLength };
}
