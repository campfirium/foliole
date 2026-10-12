import { z } from 'zod';

export const ATTACHMENT_BLOCK_BYTES = 512 * 1024;
export const attachmentBlockResourceSchema = z.object({
  storageKey: z.string().regex(/^[a-f0-9]{64}\.(png|jpg|gif|webp|pdf|epub)$/u),
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

  async function finish(resource: AttachmentBlockResource): Promise<AttachmentBlockStatus> {
    const hash = resource.storageKey.slice(0, 64);
    if (!await files.verifyPartial(hash)) {
      await files.discardPartial(hash);
      throw new Error('attachment_checksum_mismatch');
    }
    await files.publish(resource);
    await files.availability(hash, true);
    return { kind: 'complete', offset: resource.byteLength };
  }

  async function status(resource: AttachmentBlockResource): Promise<AttachmentBlockStatus> {
    const hash = resource.storageKey.slice(0, 64);
    if (await files.complete(resource)) {
      await files.availability(hash, true);
      return { kind: 'complete', offset: resource.byteLength };
    }
    await files.availability(hash, false);
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
    status: (resource: AttachmentBlockResource) => run(resource, status),
    receive: (resource: AttachmentBlockResource, offset: number, bytes: Uint8Array) =>
      run(resource, parsed => receive(parsed, offset, bytes))
  };
}
