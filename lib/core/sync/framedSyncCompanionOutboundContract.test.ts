import { sha256 } from '@noble/hashes/sha2.js';
import { expect, it } from 'vitest';

import { createCompanionFramedSyncOutboundValue } from './framedSyncCompanionOutboundContract.js';

const body = 'Companion body 🌿';
const data = new TextEncoder().encode(body);
const digest = (byte: number) => new Uint8Array(32).fill(byte);

function input() {
  return {
    blob: { byteLength: BigInt(data.byteLength), required: true, role: 1, sha256: sha256(data) },
    contentId: digest(1),
    dataText: body,
    factMessageBytes: new Uint8Array([10, 20, 30]),
    manifestHash: digest(1),
    publicationState: 'created' as const,
    transferId: digest(2)
  };
}

it('creates the exact JSON-safe value consumed by native companion senders', () => {
  expect(createCompanionFramedSyncOutboundValue(input())).toEqual({
    blob: {
      byte_length: String(data.byteLength), data_text: body, required: true, role: 1,
      sha256: Buffer.from(sha256(data)).toString('hex')
    },
    content_id: '01'.repeat(32),
    fact_message_bytes: [10, 20, 30],
    manifest_hash: '01'.repeat(32),
    publication_state: 'created',
    transfer_id: '02'.repeat(32)
  });
});

it('rejects a body that does not match the published blob', () => {
  expect(() => createCompanionFramedSyncOutboundValue({ ...input(), dataText: 'changed' }))
    .toThrow('framed_sync_companion_blob_mismatch');
});

it('rejects divergent content and manifest identities', () => {
  expect(() => createCompanionFramedSyncOutboundValue({ ...input(), manifestHash: digest(3) }))
    .toThrow('framed_sync_companion_manifest_identity_mismatch');
});
