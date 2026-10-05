import {
  assertFramedSyncDigest,
  FRAMED_SYNC_LIMITS
} from './framedSyncContract.js';

export type BlobChunk = Readonly<{
  data: Uint8Array;
  offset: bigint;
}>;

export type BlobDescriptor = Readonly<{
  byteLength: bigint;
  sha256: Uint8Array;
}>;

export type ManifestBlobDescriptor = BlobDescriptor & Readonly<{
  required: boolean;
  role: number;
}>;

export type DurableBlobPin = ManifestBlobDescriptor & Readonly<{
  durable: true;
  transferId: Uint8Array;
  verified: true;
}>;

export type BlobChunkAcceptance = Readonly<{
  chunks: readonly BlobChunk[];
  result: 'created' | 'identical';
}>;

function digestKey(value: Uint8Array) {
  return [...assertFramedSyncDigest(value, 'blob_hash')]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function compareBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => right[index] === byte);
}

function compareHashes(left: Uint8Array, right: Uint8Array) {
  return compareBytes(
    assertFramedSyncDigest(left, 'blob_hash'),
    assertFramedSyncDigest(right, 'blob_hash')
  );
}

export function assertBlobDescriptor(descriptor: BlobDescriptor) {
  assertFramedSyncDigest(descriptor.sha256, 'blob_hash');
  if (descriptor.byteLength < 0n ||
      descriptor.byteLength > BigInt(FRAMED_SYNC_LIMITS.maxBlobBytes)) {
    throw new Error('blob_size_limit_exceeded');
  }
  return descriptor;
}

export function expectedBlobChunkCount(descriptor: BlobDescriptor) {
  assertBlobDescriptor(descriptor);
  if (descriptor.byteLength === 0n) return 0;
  const chunkBytes = BigInt(FRAMED_SYNC_LIMITS.blobChunkBytes);
  return Number((descriptor.byteLength + chunkBytes - 1n) / chunkBytes);
}

export function assertTransferChunkBudget(blobs: readonly BlobDescriptor[]) {
  const chunks = blobs.reduce((total, blob) => total + expectedBlobChunkCount(blob), 0);
  if (chunks > FRAMED_SYNC_LIMITS.maxChunksPerTransfer) {
    throw new Error('transfer_chunk_limit_exceeded');
  }
  return chunks;
}

export function acceptBlobChunk(
  descriptor: BlobDescriptor,
  existing: readonly BlobChunk[],
  incoming: BlobChunk
): BlobChunkAcceptance {
  assertBlobDescriptor(descriptor);
  if (incoming.offset < 0n || incoming.data.byteLength === 0 ||
      incoming.data.byteLength > FRAMED_SYNC_LIMITS.blobChunkBytes) {
    throw new Error('blob_chunk_invalid');
  }
  const chunkBytes = BigInt(FRAMED_SYNC_LIMITS.blobChunkBytes);
  if (incoming.offset % chunkBytes !== 0n) throw new Error('blob_chunk_offset_invalid');
  const incomingEnd = incoming.offset + BigInt(incoming.data.byteLength);
  if (incomingEnd > descriptor.byteLength) throw new Error('blob_chunk_out_of_bounds');
  const expectedBytes = Number(
    descriptor.byteLength - incoming.offset < chunkBytes
      ? descriptor.byteLength - incoming.offset
      : chunkBytes
  );
  if (incoming.data.byteLength !== expectedBytes) throw new Error('blob_chunk_length_invalid');

  for (const chunk of existing) {
    const chunkEnd = chunk.offset + BigInt(chunk.data.byteLength);
    if (chunk.offset === incoming.offset && compareBytes(chunk.data, incoming.data)) {
      return { chunks: existing, result: 'identical' };
    }
    if (incoming.offset < chunkEnd && chunk.offset < incomingEnd) {
      throw new Error('blob_chunk_overlap');
    }
  }

  return {
    chunks: [...existing, incoming].sort((left, right) => left.offset < right.offset ? -1 : 1),
    result: 'created'
  };
}

export function hasCompleteBlobCoverage(descriptor: BlobDescriptor, chunks: readonly BlobChunk[]) {
  assertBlobDescriptor(descriptor);
  if (descriptor.byteLength === 0n) return chunks.length === 0;
  let nextOffset = 0n;
  const chunkBytes = BigInt(FRAMED_SYNC_LIMITS.blobChunkBytes);
  for (const chunk of [...chunks].sort((left, right) => left.offset < right.offset ? -1 : 1)) {
    const remaining = descriptor.byteLength - chunk.offset;
    const expectedBytes = Number(remaining < chunkBytes ? remaining : chunkBytes);
    if (chunk.offset !== nextOffset || chunk.offset % chunkBytes !== 0n ||
        chunk.data.byteLength !== expectedBytes) return false;
    nextOffset += BigInt(chunk.data.byteLength);
  }
  return nextOffset === descriptor.byteLength;
}

export function verifyCompleteBlob(
  descriptor: BlobDescriptor,
  chunks: readonly BlobChunk[],
  computedSha256: Uint8Array
) {
  if (!hasCompleteBlobCoverage(descriptor, chunks)) throw new Error('blob_coverage_incomplete');
  if (!compareHashes(computedSha256, descriptor.sha256)) throw new Error('blob_hash_mismatch');
  return true;
}

export function selectMissingBlobs(
  transferId: Uint8Array,
  offers: readonly BlobDescriptor[],
  pins: readonly DurableBlobPin[]
) {
  assertFramedSyncDigest(transferId, 'transfer_id');
  const seen = new Set<string>();
  return offers.filter((offer) => {
    assertBlobDescriptor(offer);
    const key = digestKey(offer.sha256);
    if (seen.has(key)) throw new Error('blob_offer_duplicate');
    seen.add(key);
    return !pins.some((pin) => compareHashes(pin.transferId, transferId) &&
      compareHashes(pin.sha256, offer.sha256) &&
      pin.byteLength === offer.byteLength);
  }).map((offer) => offer.sha256);
}

export function validateBlobOffer(
  manifest: readonly ManifestBlobDescriptor[],
  offer: readonly ManifestBlobDescriptor[]
) {
  if (offer.length > FRAMED_SYNC_LIMITS.maxBlobsPerTransfer) {
    throw new Error('blob_offer_limit_exceeded');
  }
  const declared = new Map(manifest.map((blob) => [digestKey(blob.sha256), blob]));
  const seen = new Set<string>();
  for (const blob of offer) {
    assertBlobDescriptor(blob);
    const key = digestKey(blob.sha256);
    if (seen.has(key)) throw new Error('blob_offer_duplicate');
    seen.add(key);
    const expected = declared.get(key);
    if (!expected) throw new Error('blob_offer_undeclared');
    if (expected.byteLength !== blob.byteLength || expected.required !== blob.required ||
        expected.role !== blob.role) throw new Error('blob_offer_descriptor_mismatch');
  }
  return offer;
}

export function validateMissingBlobSet(
  offer: readonly BlobDescriptor[],
  missingHashes: readonly Uint8Array[]
) {
  if (missingHashes.length > FRAMED_SYNC_LIMITS.maxBlobsPerTransfer) {
    throw new Error('missing_blob_set_limit_exceeded');
  }
  const offered = new Set(offer.map((blob) => digestKey(blob.sha256)));
  const seen = new Set<string>();
  for (const hash of missingHashes) {
    const key = digestKey(hash);
    if (!offered.has(key)) throw new Error('missing_blob_not_offered');
    if (seen.has(key)) throw new Error('missing_blob_duplicate');
    seen.add(key);
  }
  return missingHashes;
}

export function assertRequiredBlobsAvailable(
  transferId: Uint8Array,
  requiredBlobs: readonly BlobDescriptor[],
  availablePins: readonly DurableBlobPin[]
) {
  assertFramedSyncDigest(transferId, 'transfer_id');
  for (const blob of requiredBlobs) {
    if (!availablePins.some((pin) => compareHashes(pin.transferId, transferId) &&
      compareHashes(pin.sha256, blob.sha256) && pin.byteLength === blob.byteLength)) {
      throw new Error('required_blob_unavailable');
    }
  }
}
