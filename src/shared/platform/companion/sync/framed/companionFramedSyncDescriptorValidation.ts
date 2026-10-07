import { bytesToHex } from '@noble/hashes/utils.js';

import { framedSyncBytes, sameFramedSyncBytes } from '../../../../../../lib/core/database/framedSyncStagingSerialization.js';
import type { DbRow } from '../../../../../../lib/core/sync/dbPort.js';
import type { CanonicalBlob, CanonicalFact } from '../../../../../../lib/core/sync/framedSyncCanonicalManifest.js';
import { isFramedSyncNodeIdentityFact } from '../../../../../../lib/core/sync/framedSyncNodeFactContract.js';
import { readFramedSyncNodeResources } from '../../../../../../lib/core/sync/framedSyncNodeResources.js';
import type { NativeSyncNodeRecord } from '../../../../../../lib/platform/nativeSyncContract.js';

export function blob(row: DbRow): CanonicalBlob {
  const byteLength = row.byte_length;
  const role = row.role;
  const required = row.required;
  if ((typeof byteLength !== 'number' && typeof byteLength !== 'string' && typeof byteLength !== 'bigint') ||
      typeof role !== 'number' || typeof required !== 'number') throw new Error('framed_sync_blob_row_invalid');
  return { byteLength: BigInt(byteLength), required: required === 1, role,
    sha256: framedSyncBytes(row, 'sha256') };
}

export function sameBlob(left: CanonicalBlob, right: CanonicalBlob) {
  return left.byteLength === right.byteLength && left.required === right.required &&
    left.role === right.role && sameFramedSyncBytes(left.sha256, right.sha256);
}

export function uniqueRows(rows: DbRow[]) {
  const byHash = new Map(rows.map((row) => [bytesToHex(framedSyncBytes(row, 'sha256')), row]));
  if (byHash.size !== rows.length) throw new Error('framed_sync_android_blob_identity_mismatch');
  return byHash;
}

export function validateResources(
  facts: CanonicalFact[],
  nodes: readonly Readonly<{ snapshot: Pick<NativeSyncNodeRecord['snapshot'], 'resource_references'> }>[],
  rows: DbRow[], storageKeys: readonly string[]
) {
  const byHash = uniqueRows(rows);
  const expectedKeys = new Set<string>();
  facts.forEach((fact, index) => {
    if (isFramedSyncNodeIdentityFact(fact)) return;
    const resourceDescriptors = fact.blobs.filter((entry) => entry.role !== 1 && entry.role !== 5);
    const descriptors = new Map(resourceDescriptors
      .map((entry) => [bytesToHex(entry.sha256), entry]));
    const resources = readFramedSyncNodeResources(nodes[index]!.snapshot.resource_references);
    if (descriptors.size !== resourceDescriptors.length || descriptors.size !== resources.length) {
      throw new Error('framed_sync_android_resource_identity_mismatch');
    }
    for (const resource of resources) {
      const row = byHash.get(resource.contentHash);
      const descriptor = descriptors.get(resource.contentHash);
      if (!row || !descriptor || String(row.storage_key) !== resource.storageKey ||
          descriptor.role !== resource.role || !sameBlob(descriptor, blob(row))) {
        throw new Error('framed_sync_android_resource_identity_mismatch');
      }
      expectedKeys.add(resource.storageKey);
    }
  });
  const suppliedKeys = new Set(storageKeys);
  if (byHash.size !== expectedKeys.size || suppliedKeys.size !== storageKeys.length ||
      suppliedKeys.size !== expectedKeys.size || [...expectedKeys].some((key) => !suppliedKeys.has(key))) {
    throw new Error('framed_sync_android_resource_identity_mismatch');
  }
}
