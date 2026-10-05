import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import type { CanonicalManifest } from './framedSyncCanonicalManifest.js';
import {
  FRAMED_SYNC_LIMITS,
  FRAMED_SYNC_PROTOCOL_VERSION,
  type PublishedTransfer
} from './framedSyncContract.js';
import { buildFramedSyncTransferPayloads } from './framedSyncTransferPayloads.js';

function fixture() {
  const data = new Uint8Array(FRAMED_SYNC_LIMITS.blobChunkBytes + 1).fill(7);
  const blob = { byteLength: BigInt(data.byteLength), required: true, role: 1, sha256: sha256(data) };
  const manifest: CanonicalManifest = { blobs: [blob], facts: [{
    blobs: [blob], body: [], factId: 'version-1', globalId: 'node-1', kind: 2,
    objectType: 'node', sharedStateHash: new Uint8Array(32).fill(8)
  }] };
  const published: PublishedTransfer = {
    blobCount: 1n, contentId: new Uint8Array(32).fill(1), factCount: 1n,
    manifestHash: new Uint8Array(32).fill(1), totalBlobBytes: blob.byteLength,
    transferId: new Uint8Array(32).fill(2), context: {
      groupId: 'group-1', protocolVersion: FRAMED_SYNC_PROTOCOL_VERSION,
      receiverDeviceId: 'receiver', receiverLibraryEpoch: 'receiver-epoch',
      senderDeviceId: 'sender', senderLibraryEpoch: 'sender-epoch'
    }
  };
  return { blob, data, manifest, published };
}

it('builds one ordered transfer stream and chunks blob content at the shared limit', () => {
  const value = fixture();
  const payloads = buildFramedSyncTransferPayloads({
    attemptId: new Uint8Array(16).fill(3),
    blobContents: [{ data: value.data, sha256: value.blob.sha256 }],
    manifest: value.manifest,
    published: value.published
  });
  expect(payloads.map((payload) => payload.payloadCase)).toEqual([
    'transfer_header', 'fact', 'blob_chunk', 'blob_chunk', 'transfer_trailer'
  ]);
  expect((payloads[2]!.payload as { data: Uint8Array }).data).toHaveLength(
    FRAMED_SYNC_LIMITS.blobChunkBytes
  );
  expect((payloads[3]!.payload as { data: Uint8Array }).data).toHaveLength(1);
});

it('rejects blob bytes that do not match the published manifest', () => {
  const value = fixture();
  expect(() => buildFramedSyncTransferPayloads({
    attemptId: new Uint8Array(16),
    blobContents: [{ data: value.data.slice(1), sha256: value.blob.sha256 }],
    manifest: value.manifest,
    published: value.published
  })).toThrow('framed_sync_blob_content_mismatch');
});
