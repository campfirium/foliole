import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';
import { assertFramedSyncDigest, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';

export type CompanionFramedSyncOutboundValue = Readonly<{
  blob: Readonly<{
    byte_length: string;
    data_text: string;
    required: boolean;
    role: number;
    sha256: string;
  }>;
  content_id: string;
  fact_message_bytes: readonly number[];
  manifest_hash: string;
  publication_state: 'created' | 'identical';
  transfer_id: string;
}>;

type OutboundValueInput = Readonly<{
  blob: CanonicalBlob;
  contentId: Uint8Array;
  dataText: string;
  factMessageBytes: Uint8Array;
  manifestHash: Uint8Array;
  publicationState: CompanionFramedSyncOutboundValue['publication_state'];
  transferId: Uint8Array;
}>;

const encoder = new TextEncoder();

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function assertBlob(input: OutboundValueInput) {
  const data = encoder.encode(input.dataText);
  if (BigInt(data.byteLength) !== input.blob.byteLength ||
      !sameBytes(sha256(data), input.blob.sha256)) {
    throw new Error('framed_sync_companion_blob_mismatch');
  }
}

function assertFactMessage(bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > FRAMED_SYNC_LIMITS.maxDecompressedFrameBytes) {
    throw new Error('framed_sync_companion_fact_message_invalid');
  }
}

export function createCompanionFramedSyncOutboundValue(
  input: OutboundValueInput
): CompanionFramedSyncOutboundValue {
  assertFramedSyncDigest(input.contentId, 'content_id');
  assertFramedSyncDigest(input.manifestHash, 'manifest_hash');
  assertFramedSyncDigest(input.transferId, 'transfer_id');
  if (!sameBytes(input.contentId, input.manifestHash)) {
    throw new Error('framed_sync_companion_manifest_identity_mismatch');
  }
  assertFramedSyncDigest(input.blob.sha256, 'blob_sha256');
  assertBlob(input);
  assertFactMessage(input.factMessageBytes);
  return {
    blob: {
      byte_length: input.blob.byteLength.toString(),
      data_text: input.dataText,
      required: input.blob.required,
      role: input.blob.role,
      sha256: bytesToHex(input.blob.sha256)
    },
    content_id: bytesToHex(input.contentId),
    fact_message_bytes: Array.from(input.factMessageBytes),
    manifest_hash: bytesToHex(input.manifestHash),
    publication_state: input.publicationState,
    transfer_id: bytesToHex(input.transferId)
  };
}
