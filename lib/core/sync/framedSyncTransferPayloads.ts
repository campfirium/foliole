import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import { assertBlobDescriptor, isBodyDescriptor } from './framedSyncBlobContract.js';
import type { CanonicalManifest } from './framedSyncCanonicalManifest.js';
import { FRAMED_SYNC_FRAME_TYPES, FRAMED_SYNC_LIMITS, type PublishedTransfer } from './framedSyncContract.js';
import { iterateFramedSyncFactPayloads } from './framedSyncFactPayloads.js';
import type { ProtocolPayloadCase } from './framedSyncReceiver.js';
import { manifestToWire, wireUint64 } from './framedSyncWireProjection.js';

export type FramedSyncTransferPayload = Readonly<{
  frameType: number;
  payload: unknown;
  payloadCase: ProtocolPayloadCase;
}>;

export interface FramedSyncBlobContent {
  data: Uint8Array;
  sha256: Uint8Array;
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function verifiedBlobContents(manifest: CanonicalManifest, contents: readonly FramedSyncBlobContent[]) {
  const byHash = new Map(contents.map((value) => [bytesToHex(value.sha256), value]));
  if (byHash.size !== contents.length || byHash.size !== manifest.blobs.length) {
    throw new Error('framed_sync_blob_content_set_mismatch');
  }
  return manifest.blobs.map((blob) => {
    assertBlobDescriptor(blob);
    const content = byHash.get(bytesToHex(blob.sha256));
    if (!content || BigInt(content.data.byteLength) !== blob.byteLength ||
        !sameBytes(sha256(content.data), blob.sha256)) {
      throw new Error('framed_sync_blob_content_mismatch');
    }
    return { ...content, role: blob.role };
  });
}

export function buildFramedSyncTransferPayloads(input: Readonly<{
  attemptId: Uint8Array;
  blobContents: readonly FramedSyncBlobContent[];
  manifest: CanonicalManifest;
  published: PublishedTransfer;
}>) {
  const payloads: FramedSyncTransferPayload[] = [{
    frameType: FRAMED_SYNC_FRAME_TYPES.transferHeader,
    payloadCase: 'transfer_header',
    payload: {
      attemptId: input.attemptId,
      manifest: manifestToWire(input.manifest, input.published.context.groupId, input.published.contentId),
      transferId: input.published.transferId
    }
  }];
  for (const fact of input.manifest.facts) payloads.push(...iterateFramedSyncFactPayloads(fact));
  for (const content of verifiedBlobContents(input.manifest, input.blobContents)) {
    const payloadBytes = isBodyDescriptor(content) ? TEXT_BODY_MAX_BYTES : FRAMED_SYNC_LIMITS.blobChunkBytes;
    const count = Math.ceil(content.data.byteLength / payloadBytes);
    for (let index = 0; index < count; index += 1) {
      const offset = index * payloadBytes;
      payloads.push({
        frameType: FRAMED_SYNC_FRAME_TYPES.blobChunk,
        payloadCase: 'blob_chunk',
        payload: {
          blobHash: content.sha256,
          data: content.data.slice(offset, offset + payloadBytes),
          offset: wireUint64(BigInt(offset)),
          transferId: input.published.transferId
        }
      });
    }
  }
  payloads.push({
    frameType: FRAMED_SYNC_FRAME_TYPES.transferTrailer,
    payloadCase: 'transfer_trailer',
    payload: {
      blobCount: wireUint64(input.published.blobCount),
      factCount: wireUint64(input.published.factCount),
      manifestHash: input.published.manifestHash,
      transferId: input.published.transferId
    }
  });
  return payloads;
}
