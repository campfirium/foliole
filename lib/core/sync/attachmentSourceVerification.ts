import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';

import { ATTACHMENT_BLOCK_BYTES } from './attachmentBlockReceiver.js';
import type { AttachmentBlockSource } from './attachmentBlockTransfer.js';

type File = Parameters<Parameters<AttachmentBlockSource['withFile']>[1]>[0];
export interface AttachmentDigest { update(bytes: Uint8Array): unknown; digest(): Uint8Array }
type Proof = { storageKey: string; length: number; offset: number; blocks: Uint8Array[];
  digest: AttachmentDigest; complete: boolean; busy: boolean };

export class AttachmentVerificationPending extends Error {
  constructor() { super('attachment_verification_pending'); }
}

/** Volatile send-side proofs only. Receivers still verify the complete received file. */
export class AttachmentSourceVerification {
  private readonly proofs = new Map<string, Proof>();
  constructor(private readonly capacity = 128) {}

  invalidate(storageKey?: string) {
    for (const [key, proof] of this.proofs) {
      if (!storageKey || proof.storageKey === storageKey) this.proofs.delete(key);
    }
  }

  async verify(libraryIdentity: string, file: File, shouldYield?: () => boolean,
    createDigest: () => AttachmentDigest = () => sha256.create()): Promise<File> {
    const { storageKey, byteLength } = file.resource;
    const identity = parseCanonicalAttachmentStorageKey(storageKey);
    if (!identity || !libraryIdentity) throw new Error('attachment_source_identity_invalid');
    const key = JSON.stringify([libraryIdentity, storageKey]);
    let proof = this.proofs.get(key);
    if (proof?.busy) throw new AttachmentVerificationPending();
    if (!proof || proof.length !== byteLength) {
      proof = { storageKey, length: byteLength, offset: 0, blocks: [], digest: createDigest(), complete: false, busy: false };
    }
    this.proofs.delete(key);
    this.proofs.set(key, proof);
    while (this.proofs.size > this.capacity) this.proofs.delete(this.proofs.keys().next().value!);
    const current = proof;
    const assertCurrent = () => {
      if (this.proofs.get(key) !== current) throw new AttachmentVerificationPending();
    };
    current.busy = true;
    try {
      await scan(file, current, identity.contentHash, createDigest, shouldYield, assertCurrent);
      return { resource: file.resource, read: async (offset, length) => {
        try { return await readVerified(file, current, offset, length, createDigest, () => {
          if (this.proofs.get(key) !== current) throw new Error('attachment_source_proof_invalidated');
        }); }
        catch (error) { if (this.proofs.get(key) === current) this.proofs.delete(key); throw error; }
      } };
    } catch (error) {
      if (!(error instanceof AttachmentVerificationPending) && this.proofs.get(key) === current) this.proofs.delete(key);
      throw error;
    } finally { current.busy = false; }
  }
}

async function scan(file: File, proof: Proof, expected: string, createDigest: () => AttachmentDigest,
  shouldYield: (() => boolean) | undefined, assertCurrent: () => void) {
  while (!proof.complete && proof.offset < proof.length) {
    const length = Math.min(ATTACHMENT_BLOCK_BYTES, proof.length - proof.offset);
    const bytes = await file.read(proof.offset, length);
    if (bytes.length !== length) throw new Error('attachment_source_truncated');
    proof.digest.update(bytes);
    const block = createDigest();
    block.update(bytes);
    proof.blocks.push(block.digest());
    proof.offset += length;
    // Native reads and fast Promise continuations must also give input events a turn.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    assertCurrent();
    if (proof.offset < proof.length && shouldYield?.()) throw new AttachmentVerificationPending();
  }
  if (!proof.complete) {
    if (bytesToHex(proof.digest.digest()) !== expected) throw new Error('attachment_source_invalid');
    proof.complete = true;
  }
}

async function readVerified(file: File, proof: Proof, offset: number, length: number,
  createDigest: () => AttachmentDigest, assertCurrent: () => void) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 ||
      length > ATTACHMENT_BLOCK_BYTES || offset + length > proof.length) throw new Error('attachment_source_range_invalid');
  const output = new Uint8Array(length);
  for (let start = Math.floor(offset / ATTACHMENT_BLOCK_BYTES) * ATTACHMENT_BLOCK_BYTES; start < offset + length; start += ATTACHMENT_BLOCK_BYTES) {
    assertCurrent();
    const size = Math.min(ATTACHMENT_BLOCK_BYTES, proof.length - start);
    const bytes = await file.read(start, size);
    const digest = createDigest();
    digest.update(bytes);
    const actual = digest.digest();
    const expected = proof.blocks[start / ATTACHMENT_BLOCK_BYTES]!;
    // Detect local corruption before sending any bytes, even when metadata is unchanged.
    if (bytes.length !== size || !actual.every((byte, index) => byte === expected[index])) throw new Error('attachment_source_invalid');
    assertCurrent();
    const from = Math.max(offset, start), end = Math.min(offset + length, start + size);
    output.set(bytes.subarray(from - start, end - start), from - offset);
  }
  return output;
}

export const attachmentSourceVerification = new AttachmentSourceVerification();
