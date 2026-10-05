import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import { createCompanionFramedSyncOutboundValue } from './framedSyncCompanionOutboundContract.js';

const body = 'Companion body 🌿';
const data = new TextEncoder().encode(body);
const digest = (byte: number) => new Uint8Array(32).fill(byte);

function input() {
  return {
    blobs: [{ blob: { byteLength: BigInt(data.byteLength), required: true, role: 1,
      sha256: sha256(data) }, dataText: body }],
    contentId: digest(1),
    factMessageBytesList: [new Uint8Array([10, 20, 30])],
    manifestHash: digest(1),
    publicationState: 'created' as const,
    transferId: digest(2)
  };
}

it('creates the exact JSON-safe value consumed by native companion senders', () => {
  expect(createCompanionFramedSyncOutboundValue(input())).toEqual({
    blobs: [{
      byte_length: String(data.byteLength), data_text: body, required: true, role: 1,
      sha256: Buffer.from(sha256(data)).toString('hex')
    }],
    content_id: '01'.repeat(32),
    fact_message_bytes_list: [[10, 20, 30]],
    manifest_hash: '01'.repeat(32),
    publication_state: 'created',
    transfer_id: '02'.repeat(32)
  });
});

it('rejects a body that does not match the published blob', () => {
  expect(() => createCompanionFramedSyncOutboundValue({ ...input(),
    blobs: [{ ...input().blobs[0]!, dataText: 'changed' }] }))
    .toThrow('framed_sync_companion_blob_mismatch');
});

it('rejects divergent content and manifest identities', () => {
  expect(() => createCompanionFramedSyncOutboundValue({ ...input(), manifestHash: digest(3) }))
    .toThrow('framed_sync_companion_manifest_identity_mismatch');
});

it('projects a native resource reference without a data_text surrogate', () => {
  const hash = digest(7);
  const storageKey = `${'07'.repeat(32)}.pdf`;
  expect(createCompanionFramedSyncOutboundValue({ ...input(), blobs: [{
    blob: { byteLength: 4096n, required: true, role: 3, sha256: hash }, storageKey
  }] }).blobs).toEqual([{
    byte_length: '4096', required: true, role: 3, sha256: '07'.repeat(32),
    storage_key: storageKey
  }]);
});
