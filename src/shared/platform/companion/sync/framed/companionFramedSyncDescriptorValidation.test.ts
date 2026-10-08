import { hexToBytes } from '@noble/hashes/utils.js';
import { expect, it } from 'vitest';

import type { CanonicalFact } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';

import { validateResources } from './companionFramedSyncDescriptorValidation';

const hash = 'a'.repeat(64);
const storageKey = `${hash}.png`;
const references = JSON.stringify([{ original_name: 'Image.png', role: 'image', storage_key: storageKey }]);
const nodes = [{ snapshot: { resource_references: references } }];
const descriptor = { byteLength: 17n, required: true, role: 2, sha256: hexToBytes(hash) };
const row = { byte_length: 17, required: 1, role: 2, sha256: hexToBytes(hash), storage_key: storageKey };

function fact(blobs: CanonicalFact['blobs']): CanonicalFact {
  return { blobs, body: [], factId: 'version', globalId: 'node', kind: 2,
    objectType: 'node', sharedStateHash: new Uint8Array(32) };
}

it('accepts database-only facts with valid retained references and no resource pins or keys', () => {
  expect(() => validateResources([fact([])], nodes, [], [])).not.toThrow();
  expect(() => validateResources([fact([])], nodes, [row], []))
    .toThrow('framed_sync_android_resource_identity_mismatch');
  expect(() => validateResources([fact([])], nodes, [], [storageKey]))
    .toThrow('framed_sync_android_resource_identity_mismatch');
});

it('still rejects invalid retained references when database facts carry no resources', () => {
  expect(() => validateResources([fact([])], [{ snapshot: {
    resource_references: JSON.stringify([{ role: 'image', storage_key: 'invalid' }])
  } }], [], [])).toThrow('node_resource_reference_invalid');
});

it('preserves exact descriptor, pin and key validation for mixed resource batches', () => {
  expect(() => validateResources([fact([descriptor])], nodes, [row], [storageKey])).not.toThrow();
  expect(() => validateResources([fact([descriptor])], nodes, [], []))
    .toThrow('framed_sync_android_resource_identity_mismatch');
  expect(() => validateResources([fact([descriptor])], nodes, [{ ...row, byte_length: 18 }], [storageKey]))
    .toThrow('framed_sync_android_resource_identity_mismatch');
  expect(() => validateResources([fact([descriptor])], nodes, [row], [storageKey, storageKey]))
    .toThrow('framed_sync_android_resource_identity_mismatch');
});
