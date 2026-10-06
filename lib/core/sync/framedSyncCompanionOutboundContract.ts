import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';
import { assertFramedSyncDigest, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';

export type CompanionFramedSyncOutboundValue = Readonly<{
  blobs: readonly Readonly<{
    byte_length: string;
    data_text?: string;
    required: boolean;
    role: number;
    sha256: string;
    storage_key?: string;
  }>[];
  content_id: string;
  fact_message_bytes_list: readonly (readonly number[])[];
  manifest_hash: string;
  publication_state: 'created' | 'identical';
  transfer_id: string;
}>;

type OutboundValueInput = Readonly<{
  blobs: readonly Readonly<{
    blob: CanonicalBlob;
    dataText?: string;
    storageKey?: string;
  }>[];
  contentId: Uint8Array;
  factMessageBytesList: readonly Uint8Array[];
  manifestHash: Uint8Array;
  publicationState: CompanionFramedSyncOutboundValue['publication_state'];
  transferId: Uint8Array;
}>;

const encoder = new TextEncoder();

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function assertBlob(input: OutboundValueInput['blobs'][number]) {
  if (input.storageKey !== undefined) {
    if (input.dataText !== undefined || (input.blob.role === 1 || input.blob.role === 5) ||
        !input.storageKey.startsWith(`${bytesToHex(input.blob.sha256)}.`)) {
      throw new Error('framed_sync_companion_blob_mismatch');
    }
    return;
  }
  if (input.dataText === undefined || (input.blob.role !== 1 && input.blob.role !== 5)) {
    throw new Error('framed_sync_companion_blob_mismatch');
  }
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
  for (const blob of input.blobs) {
    assertFramedSyncDigest(blob.blob.sha256, 'blob_sha256');
    assertBlob(blob);
  }
  if (input.factMessageBytesList.length === 0) {
    throw new Error('framed_sync_companion_fact_message_invalid');
  }
  for (const bytes of input.factMessageBytesList) assertFactMessage(bytes);
  return {
    blobs: input.blobs.map(({ blob, dataText, storageKey }) => ({
      byte_length: blob.byteLength.toString(),
      ...(dataText === undefined ? {} : { data_text: dataText }),
      required: blob.required, role: blob.role, sha256: bytesToHex(blob.sha256),
      ...(storageKey === undefined ? {} : { storage_key: storageKey })
    })),
    content_id: bytesToHex(input.contentId),
    fact_message_bytes_list: input.factMessageBytesList.map((bytes) => Array.from(bytes)),
    manifest_hash: bytesToHex(input.manifestHash),
    publication_state: input.publicationState,
    transfer_id: bytesToHex(input.transferId)
  };
}
