import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';
import { assertFramedSyncDigest, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';

export type CompanionFramedSyncOutboundValue = Readonly<{
  batch_ready?: boolean;
  blobs: readonly Readonly<{
    byte_length: string;
    data_text?: string;
    body_source?: 'frozen_body';
    required: boolean;
    role: number;
    sha256: string;
    storage_key?: string;
  }>[];
  content_id: string;
  header_message_bytes: readonly number[];
  manifest_hash: string;
  publication_state: 'created' | 'identical';
  transfer_id: string;
}>;

type OutboundValueInput = Readonly<{
  batchReady?: boolean;
  blobs: readonly Readonly<{
    blob: CanonicalBlob;
    dataText?: string;
    frozenBody?: boolean;
    storageKey?: string;
  }>[];
  contentId: Uint8Array;
  headerMessageBytes: Uint8Array;
  manifestHash: Uint8Array;
  publicationState: CompanionFramedSyncOutboundValue['publication_state'];
  transferId: Uint8Array;
}>;

const encoder = new TextEncoder();

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function assertBlob(input: OutboundValueInput['blobs'][number]) {
  if (input.frozenBody !== undefined) {
    if (input.frozenBody !== true || input.dataText !== undefined ||
        input.storageKey !== undefined || (input.blob.role !== 1 && input.blob.role !== 5) ||
        input.blob.byteLength < 0n || input.blob.byteLength > BigInt(TEXT_BODY_MAX_BYTES)) {
      throw new Error('framed_sync_companion_blob_mismatch');
    }
    return;
  }
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

function assertHeaderMessage(bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > FRAMED_SYNC_LIMITS.maxManifestBytes) {
    throw new Error('framed_sync_companion_header_message_invalid');
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
  assertHeaderMessage(input.headerMessageBytes);
  return {
    ...(input.batchReady === undefined ? {} : { batch_ready: input.batchReady }),
    blobs: input.blobs.map(({ blob, dataText, storageKey, frozenBody }) => ({
      byte_length: blob.byteLength.toString(),
      ...(dataText === undefined ? {} : { data_text: dataText }),
      ...(frozenBody === undefined ? {} : { body_source: 'frozen_body' as const }),
      required: blob.required, role: blob.role, sha256: bytesToHex(blob.sha256),
      ...(storageKey === undefined ? {} : { storage_key: storageKey })
    })),
    content_id: bytesToHex(input.contentId),
    header_message_bytes: Array.from(input.headerMessageBytes),
    manifest_hash: bytesToHex(input.manifestHash),
    publication_state: input.publicationState,
    transfer_id: bytesToHex(input.transferId)
  };
}
