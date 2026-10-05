import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ManifestBlobDescriptor } from './framedSyncBlobContract.js';
import { FramedSyncBlobTransferState } from './framedSyncBlobTransferState.js';

const encode = (value: string) => new TextEncoder().encode(value);
const digest = (value: Uint8Array | string) => new Uint8Array(
  createHash('sha256').update(typeof value === 'string' ? value : value).digest()
);
const sha256 = async (chunks: readonly Uint8Array[]) => {
  const hash = createHash('sha256');
  for (const chunk of chunks) hash.update(chunk);
  return new Uint8Array(hash.digest());
};
const transfer = (value: string) => digest(`transfer:${value}`);
const attempt = (value: number) => new Uint8Array(16).fill(value);

function body(value: string): { data: Uint8Array; descriptor: ManifestBlobDescriptor } {
  const data = encode(value);
  return {
    data,
    descriptor: {
      byteLength: BigInt(data.byteLength),
      required: true,
      role: 1,
      sha256: digest(data)
    }
  };
}

function offer(
  transferId: Uint8Array,
  attemptId: Uint8Array,
  descriptor: ManifestBlobDescriptor
) {
  return { attemptId, blobs: [descriptor], manifest: [descriptor], transferId };
}

describe('framed sync blob transfer state', () => {
  it('returns a missing set and pins verified content per transfer', async () => {
    const state = new FramedSyncBlobTransferState(sha256);
    const present = body('present');
    const missing = body('missing');
    await state.seedAvailableBlob(present.descriptor, present.data);
    const firstTransfer = transfer('first');
    const secondTransfer = transfer('second');

    expect(state.commitBlobOffer({
      attemptId: attempt(1),
      blobs: [present.descriptor, missing.descriptor],
      manifest: [present.descriptor, missing.descriptor],
      transferId: firstTransfer
    })).toEqual([missing.descriptor.sha256]);
    expect(state.hasTransferPin(firstTransfer, present.descriptor.sha256)).toBe(true);
    expect(state.hasTransferPin(secondTransfer, present.descriptor.sha256)).toBe(false);
    expect(state.commitBlobOffer(offer(
      secondTransfer,
      attempt(2),
      present.descriptor
    ))).toEqual([]);
    expect(state.hasTransferPin(secondTransfer, present.descriptor.sha256)).toBe(true);
  });

  it('isolates chunk coverage by attempt and accepts only exact replay', async () => {
    const state = new FramedSyncBlobTransferState(sha256);
    const value = body('attempt-scoped-body');
    const transferId = transfer('chunk-scope');
    const firstAttempt = attempt(3);
    const secondAttempt = attempt(4);
    state.commitBlobOffer(offer(transferId, firstAttempt, value.descriptor));
    state.commitBlobOffer(offer(transferId, secondAttempt, value.descriptor));
    const input = { attemptId: firstAttempt, data: value.data, offset: 0n,
      sha256: value.descriptor.sha256, transferId };

    expect(state.writeBlobChunk(input)).toBe('created');
    expect(state.writeBlobChunk(input)).toBe('identical');
    expect(() => state.writeBlobChunk({
      ...input,
      data: new Uint8Array(value.data.byteLength).fill(0x78)
    })).toThrow('blob_chunk_overlap');
    await expect(state.verifyAndPromoteBlob(
      transferId,
      secondAttempt,
      value.descriptor.sha256
    )).rejects.toThrow('blob_coverage_incomplete');
    state.discardAttempt(transferId, firstAttempt);
    expect(() => state.writeBlobChunk(input)).toThrow('blob_offer_required');
  });
});

describe('framed sync blob availability', () => {
  it('rejects invalid length and hash before hash-scoped promotion', async () => {
    const state = new FramedSyncBlobTransferState(sha256);
    const value = body('expected');
    const transferId = transfer('validation');
    const attemptId = attempt(5);
    state.commitBlobOffer(offer(transferId, attemptId, value.descriptor));

    expect(() => state.writeBlobChunk({
      attemptId,
      data: encode('short'),
      offset: 0n,
      sha256: value.descriptor.sha256,
      transferId
    })).toThrow('blob_chunk_length_invalid');
    const wrongHash = { ...value.descriptor, sha256: digest('wrong-hash') };
    const wrongTransfer = transfer('wrong-hash');
    state.commitBlobOffer(offer(wrongTransfer, attemptId, wrongHash));
    state.writeBlobChunk({ attemptId, data: value.data, offset: 0n,
      sha256: wrongHash.sha256, transferId: wrongTransfer });
    await expect(state.verifyAndPromoteBlob(
      wrongTransfer,
      attemptId,
      wrongHash.sha256
    )).rejects.toThrow('blob_hash_mismatch');
    expect(state.hasAvailableBlob(wrongHash.sha256)).toBe(false);
  });

  it('lets two peers exchange the body each side is missing', async () => {
    const peerA = new FramedSyncBlobTransferState(sha256);
    const peerB = new FramedSyncBlobTransferState(sha256);
    const bodyA = body('body-owned-by-a');
    const bodyB = body('body-owned-by-b');
    await peerA.seedAvailableBlob(bodyA.descriptor, bodyA.data);
    await peerB.seedAvailableBlob(bodyB.descriptor, bodyB.data);
    const toA = transfer('b-to-a');
    const toB = transfer('a-to-b');
    const attemptToA = attempt(6);
    const attemptToB = attempt(7);

    expect(peerA.commitBlobOffer(offer(toA, attemptToA, bodyB.descriptor)))
      .toEqual([bodyB.descriptor.sha256]);
    expect(peerB.commitBlobOffer(offer(toB, attemptToB, bodyA.descriptor)))
      .toEqual([bodyA.descriptor.sha256]);
    peerA.writeBlobChunk({ attemptId: attemptToA, data: bodyB.data, offset: 0n,
      sha256: bodyB.descriptor.sha256, transferId: toA });
    peerB.writeBlobChunk({ attemptId: attemptToB, data: bodyA.data, offset: 0n,
      sha256: bodyA.descriptor.sha256, transferId: toB });
    await expect(peerA.verifyAndPromoteBlob(toA, attemptToA, bodyB.descriptor.sha256))
      .resolves.toBe('available');
    await expect(peerB.verifyAndPromoteBlob(toB, attemptToB, bodyA.descriptor.sha256))
      .resolves.toBe('available');
    await expect(peerB.verifyAndPromoteBlob(toB, attemptToB, bodyA.descriptor.sha256))
      .resolves.toBe('identical');
    expect(peerA.hasAvailableBlob(bodyB.descriptor.sha256)).toBe(true);
    expect(peerB.hasAvailableBlob(bodyA.descriptor.sha256)).toBe(true);

    const replayTransfer = transfer('a-replay-to-b');
    expect(peerB.commitBlobOffer(offer(replayTransfer, attempt(8), bodyA.descriptor)))
      .toEqual([]);
    expect(peerB.hasTransferPin(replayTransfer, bodyA.descriptor.sha256)).toBe(true);
  });
});
