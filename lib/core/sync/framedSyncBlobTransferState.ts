import {
  acceptBlobChunk,
  assertBlobDescriptor,
  selectMissingBlobs,
  validateBlobOffer,
  verifyCompleteBlob,
  type BlobChunk,
  type BlobDescriptor,
  type DurableBlobPin,
  type ManifestBlobDescriptor
} from './framedSyncBlobContract.js';
import {
  assertAttemptId,
  assertFramedSyncDigest
} from './framedSyncContract.js';
import type {
  BlobChunkInput,
  BlobOfferTransactionInput
} from './framedSyncStagingContract.js';

export type BlobSha256 = (chunks: readonly Uint8Array[]) => Promise<Uint8Array>;

export type AttemptBlobOfferInput = BlobOfferTransactionInput & Readonly<{
  attemptId: Uint8Array;
  manifest: readonly ManifestBlobDescriptor[];
}>;

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength &&
    left.every((byte, index) => right[index] === byte);
}

function digestKey(value: Uint8Array, name: string) {
  return [...assertFramedSyncDigest(value, name)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function attemptKey(transferId: Uint8Array, attemptId: Uint8Array) {
  assertAttemptId(attemptId);
  const attempt = [...attemptId]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `${digestKey(transferId, 'transfer_id')}:${attempt}`;
}

function attemptBlobKey(
  transferId: Uint8Array,
  attemptId: Uint8Array,
  sha256: Uint8Array
) {
  return `${attemptKey(transferId, attemptId)}:${digestKey(sha256, 'blob_hash')}`;
}

function transferBlobKey(transferId: Uint8Array, sha256: Uint8Array) {
  return `${digestKey(transferId, 'transfer_id')}:${digestKey(sha256, 'blob_hash')}`;
}

function sameDescriptor(left: BlobDescriptor, right: BlobDescriptor) {
  return left.byteLength === right.byteLength && sameBytes(left.sha256, right.sha256);
}

function sameManifestDescriptor(
  left: ManifestBlobDescriptor,
  right: ManifestBlobDescriptor
) {
  return sameDescriptor(left, right) && left.required === right.required && left.role === right.role;
}

function copyDescriptor(descriptor: BlobDescriptor): BlobDescriptor {
  return { byteLength: descriptor.byteLength, sha256: descriptor.sha256.slice(),
    ...(descriptor.role === undefined ? {} : { role: descriptor.role }) };
}

function copyManifestDescriptor(descriptor: ManifestBlobDescriptor): ManifestBlobDescriptor {
  return { ...copyDescriptor(descriptor), required: descriptor.required, role: descriptor.role };
}

export class FramedSyncBlobTransferState {
  readonly #available = new Map<string, BlobDescriptor>();
  readonly #chunks = new Map<string, readonly BlobChunk[]>();
  readonly #offers = new Map<string, ManifestBlobDescriptor>();
  readonly #pins = new Map<string, DurableBlobPin>();

  constructor(private readonly computeSha256: BlobSha256) {}

  async seedAvailableBlob(descriptor: BlobDescriptor, data: Uint8Array) {
    assertBlobDescriptor(descriptor);
    if (BigInt(data.byteLength) !== descriptor.byteLength) {
      throw new Error('blob_length_mismatch');
    }
    const computed = await this.computeSha256([data]);
    if (!sameBytes(assertFramedSyncDigest(computed, 'blob_hash'), descriptor.sha256)) {
      throw new Error('blob_hash_mismatch');
    }
    return this.#commitAvailable(descriptor);
  }

  commitBlobOffer(input: AttemptBlobOfferInput) {
    assertAttemptId(input.attemptId);
    assertFramedSyncDigest(input.transferId, 'transfer_id');
    validateBlobOffer(input.manifest, input.blobs);
    for (const descriptor of input.blobs) {
      const key = attemptBlobKey(input.transferId, input.attemptId, descriptor.sha256);
      const existing = this.#offers.get(key);
      if (existing && !sameManifestDescriptor(existing, descriptor)) {
        throw new Error('blob_offer_identity_conflict');
      }
      const available = this.#available.get(digestKey(descriptor.sha256, 'blob_hash'));
      if (available && !sameDescriptor(available, descriptor)) {
        throw new Error('blob_available_descriptor_conflict');
      }
      this.#assertPinCompatible(input.transferId, descriptor);
    }
    for (const descriptor of input.blobs) {
      const key = attemptBlobKey(input.transferId, input.attemptId, descriptor.sha256);
      if (!this.#offers.has(key)) this.#offers.set(key, copyManifestDescriptor(descriptor));
      const available = this.#available.get(digestKey(descriptor.sha256, 'blob_hash'));
      if (!available) continue;
      this.#pin(input.transferId, descriptor);
    }
    return selectMissingBlobs(input.transferId, input.blobs, [...this.#pins.values()]);
  }

  writeBlobChunk(input: BlobChunkInput) {
    const key = attemptBlobKey(input.transferId, input.attemptId, input.sha256);
    const descriptor = this.#offers.get(key);
    if (!descriptor) throw new Error('blob_offer_required');
    const accepted = acceptBlobChunk(descriptor, this.#chunks.get(key) ?? [], {
      data: input.data,
      offset: input.offset
    });
    if (accepted.result === 'created') {
      this.#chunks.set(key, accepted.chunks.map((chunk) => ({
        data: chunk.data.slice(),
        offset: chunk.offset
      })));
    }
    return accepted.result;
  }

  async verifyAndPromoteBlob(
    transferId: Uint8Array,
    attemptId: Uint8Array,
    sha256: Uint8Array
  ) {
    const key = attemptBlobKey(transferId, attemptId, sha256);
    const descriptor = this.#offers.get(key);
    if (!descriptor) throw new Error('blob_offer_required');
    const chunks = this.#chunks.get(key) ?? [];
    this.#assertPinCompatible(transferId, descriptor);
    const computed = await this.computeSha256(chunks.map((chunk) => chunk.data));
    verifyCompleteBlob(descriptor, chunks, computed);
    const result = this.#commitAvailable(descriptor);
    this.#pin(transferId, descriptor);
    return result === 'created' ? 'available' : 'identical';
  }

  hasAvailableBlob(sha256: Uint8Array) {
    return this.#available.has(digestKey(sha256, 'blob_hash'));
  }

  hasTransferPin(transferId: Uint8Array, sha256: Uint8Array) {
    return this.#pins.has(transferBlobKey(transferId, sha256));
  }

  discardAttempt(transferId: Uint8Array, attemptId: Uint8Array) {
    const prefix = `${attemptKey(transferId, attemptId)}:`;
    for (const key of this.#offers.keys()) if (key.startsWith(prefix)) this.#offers.delete(key);
    for (const key of this.#chunks.keys()) if (key.startsWith(prefix)) this.#chunks.delete(key);
  }

  #commitAvailable(descriptor: BlobDescriptor) {
    const key = digestKey(descriptor.sha256, 'blob_hash');
    const existing = this.#available.get(key);
    if (existing) {
      if (!sameDescriptor(existing, descriptor)) {
        throw new Error('blob_available_identity_conflict');
      }
      return 'identical' as const;
    }
    this.#available.set(key, copyDescriptor(descriptor));
    return 'created' as const;
  }

  #assertPinCompatible(transferId: Uint8Array, descriptor: ManifestBlobDescriptor) {
    const key = transferBlobKey(transferId, descriptor.sha256);
    const existing = this.#pins.get(key);
    if (existing && !sameManifestDescriptor(existing, descriptor)) {
      throw new Error('blob_pin_identity_conflict');
    }
  }

  #pin(transferId: Uint8Array, descriptor: ManifestBlobDescriptor) {
    this.#assertPinCompatible(transferId, descriptor);
    const key = transferBlobKey(transferId, descriptor.sha256);
    const existing = this.#pins.get(key);
    if (!existing) this.#pins.set(key, {
      ...copyManifestDescriptor(descriptor),
      durable: true,
      transferId: transferId.slice(),
      verified: true
    });
  }
}
