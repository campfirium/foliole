import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  acceptBlobChunk,
  assertRequiredBlobsAvailable,
  assertTransferChunkBudget,
  expectedBlobChunkCount,
  hasCompleteBlobCoverage,
  selectMissingBlobs,
  validateBlobOffer,
  validateMissingBlobSet,
  verifyCompleteBlob,
  type BlobDescriptor,
  type DurableBlobPin
} from './framedSyncBlobContract.js';

function digest(value: string) {
  return new Uint8Array(createHash('sha256').update(value).digest());
}

function bytesDescriptor(value: Uint8Array): BlobDescriptor {
  return { byteLength: BigInt(value.byteLength), sha256: new Uint8Array(createHash('sha256').update(value).digest()) };
}

function descriptor(value: string) {
  return bytesDescriptor(new TextEncoder().encode(value));
}

describe('framed sync blob contract', () => {
  it.each([1, 5])('receives role %i as one complete body while attachments stay chunked', (role) => {
    const data = new Uint8Array(1_048_576).fill(0x61);
    const body = { ...bytesDescriptor(data), role };
    const whole = { data, offset: 0n };
    expect(expectedBlobChunkCount(body)).toBe(1);
    expect(acceptBlobChunk(body, [], whole).result).toBe('created');
    expect(verifyCompleteBlob(body, [whole], body.sha256)).toBe(true);
    expect(() => acceptBlobChunk(body, [], { data: data.slice(0, 512 * 1024), offset: 0n }))
      .toThrow('blob_chunk_length_invalid');
    expect(hasCompleteBlobCoverage(body, [
      { data: data.slice(0, 512 * 1024), offset: 0n },
      { data: data.slice(512 * 1024), offset: 512n * 1024n }
    ])).toBe(false);
    expect(() => acceptBlobChunk({ ...body, role: 2 }, [], whole)).toThrow('blob_chunk_invalid');
    expect(() => expectedBlobChunkCount({ ...body, byteLength: 1_048_577n }))
      .toThrow('blob_size_limit_exceeded');
  });
});

describe('framed sync attachment chunks', () => {
  it('accepts out-of-order chunks and treats an exact replay as identical', () => {
    const headBytes = new Uint8Array(512 * 1024).fill(0x61);
    const tailBytes = new TextEncoder().encode('tail');
    const allBytes = new Uint8Array(headBytes.byteLength + tailBytes.byteLength);
    allBytes.set(headBytes); allBytes.set(tailBytes, headBytes.byteLength);
    const blob = bytesDescriptor(allBytes);
    const tail = { data: tailBytes, offset: 512n * 1024n };
    const head = { data: headBytes, offset: 0n };
    const first = acceptBlobChunk(blob, [], tail);
    const replay = acceptBlobChunk(blob, first.chunks, tail);
    const complete = acceptBlobChunk(blob, replay.chunks, head);

    expect(replay.result).toBe('identical');
    expect(hasCompleteBlobCoverage(blob, complete.chunks)).toBe(true);
    expect(verifyCompleteBlob(blob, complete.chunks, blob.sha256)).toBe(true);
  });

  it('rejects overlap, bounds violations, gaps, and a wrong whole-blob hash', () => {
    const blob = descriptor('abcdef');
    const head = { data: new TextEncoder().encode('abcdef'), offset: 0n };
    expect(() => acceptBlobChunk(blob, [head], {
      data: new TextEncoder().encode('abcdef'), offset: 0n
    })).not.toThrow();
    expect(() => acceptBlobChunk(blob, [head], {
      data: new TextEncoder().encode('xxxxxx'), offset: 0n
    })).toThrow('blob_chunk_overlap');
    expect(() => acceptBlobChunk(blob, [], {
      data: new TextEncoder().encode('bc'), offset: 1n
    })).toThrow('blob_chunk_offset_invalid');
    expect(() => acceptBlobChunk(blob, [], {
      data: new TextEncoder().encode('z'), offset: 512n * 1024n
    })).toThrow('blob_chunk_out_of_bounds');
    expect(hasCompleteBlobCoverage(blob, [
      { data: new TextEncoder().encode('abc'), offset: 0n }
    ])).toBe(false);
    expect(() => verifyCompleteBlob(
      { ...blob, sha256: digest('xxxxxx') },
      [{ data: new TextEncoder().encode('abcdef'), offset: 0n }],
      digest('abcdef')
    )).toThrow('blob_hash_mismatch');
  });

  it('only omits an offered blob when a matching verified durable pin exists', () => {
    const transferId = digest('transfer');
    const present = descriptor('present');
    const missing = descriptor('missing');
    const pin: DurableBlobPin = {
      ...present, durable: true, required: true, role: 1, transferId, verified: true
    };

    expect(selectMissingBlobs(transferId, [present, missing], [pin])).toEqual([missing.sha256]);
    expect(() => selectMissingBlobs(transferId, [present, present], [pin]))
      .toThrow('blob_offer_duplicate');
  });
});

describe('framed sync blob exchange gates', () => {
  it('validates offer descriptors, missing subsets, and the required apply gate', () => {
    const transferId = digest('transfer');
    const manifestBlob = { ...descriptor('present'), required: true, role: 1 };
    const missingBlob = { ...descriptor('missing'), required: false, role: 2 };
    expect(validateBlobOffer([manifestBlob], [manifestBlob])).toEqual([manifestBlob]);
    expect(() => validateBlobOffer([manifestBlob], [
      { ...manifestBlob, role: 2 }
    ])).toThrow('blob_offer_descriptor_mismatch');
    expect(validateMissingBlobSet([manifestBlob], [manifestBlob.sha256]))
      .toEqual([manifestBlob.sha256]);
    expect(() => validateMissingBlobSet([manifestBlob], [missingBlob.sha256]))
      .toThrow('missing_blob_not_offered');
    expect(() => assertRequiredBlobsAvailable(transferId, [manifestBlob], []))
      .toThrow('required_blob_unavailable');
    const wrongTransferPin: DurableBlobPin = {
      ...manifestBlob, durable: true, transferId: digest('other-transfer'), verified: true
    };
    expect(() => assertRequiredBlobsAvailable(transferId, [manifestBlob], [wrongTransferPin]))
      .toThrow('required_blob_unavailable');
    expect(() => assertRequiredBlobsAvailable(transferId, [], [])).not.toThrow();
  });

  it('treats the verified empty hash as a complete zero-byte blob without chunks', () => {
    const empty = bytesDescriptor(new Uint8Array());
    expect(hasCompleteBlobCoverage(empty, [])).toBe(true);
    expect(verifyCompleteBlob(empty, [], empty.sha256)).toBe(true);
    expect(() => acceptBlobChunk(empty, [], { data: Uint8Array.of(1), offset: 0n }))
      .toThrow('blob_chunk_out_of_bounds');
    expect(() => verifyCompleteBlob(empty, [], digest('not-empty'))).toThrow('blob_hash_mismatch');
    expect(assertTransferChunkBudget([empty])).toBe(0);
    const maximum = { byteLength: 8n * 1024n * 1024n * 1024n, sha256: digest('maximum') };
    expect(expectedBlobChunkCount(maximum)).toBe(16_384);
    expect(() => assertTransferChunkBudget(Array.from({ length: 5 }, () => maximum)))
      .toThrow('transfer_chunk_limit_exceeded');
  });
});
