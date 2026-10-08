import { bytesToHex } from '@noble/hashes/utils.js';

import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';

import type { CanonicalBlob, CanonicalFact, CanonicalValue } from './framedSyncCanonicalManifest.js';
import { assertFramedSyncDigest, FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { createFramedSyncNodeResourceBlob, type FramedSyncNodeResource } from './framedSyncNodeResources.js';

export const FRAMED_SYNC_RESOURCE_FACT_KIND = 7;

export type FramedSyncResourceBinding = Readonly<{
  bodyHash: string;
  demandId: string;
  globalId: string;
  sharedStateHash: Uint8Array;
  versionId: string;
}>;

function factId(versionId: string, hash: string) {
  return `resource:${versionId}:${hash}`;
}

/** An attachment batch binds bytes to adopted content without carrying that content again. */
export function projectFramedSyncResourceFact(
  binding: FramedSyncResourceBinding, resource: FramedSyncNodeResource, byteLength: bigint
): CanonicalFact {
  const fact: CanonicalFact = {
    blobs: [createFramedSyncNodeResourceBlob(resource, byteLength)],
    body: [
      { name: 'body_blob_hash', value: { kind: 'string', value: binding.bodyHash } },
      { name: 'demand_id', value: { kind: 'string', value: binding.demandId } },
      { name: 'storage_key', value: { kind: 'string', value: resource.storageKey } },
      { name: 'version_id', value: { kind: 'string', value: binding.versionId } }
    ],
    factId: factId(binding.versionId, resource.contentHash),
    globalId: binding.globalId,
    kind: FRAMED_SYNC_RESOURCE_FACT_KIND,
    objectType: 'node',
    sharedStateHash: binding.sharedStateHash
  };
  restoreFramedSyncResourceFact(fact);
  return fact;
}

function stringField(fields: ReadonlyMap<string, CanonicalValue>, name: string) {
  const value = fields.get(name);
  if (value?.kind !== 'string' || !value.value) throw new Error('framed_sync_resource_fact_invalid');
  return value.value;
}

export function restoreFramedSyncResourceFact(fact: CanonicalFact): FramedSyncResourceBinding & {
  blob: CanonicalBlob; resource: FramedSyncNodeResource;
} {
  const fields = new Map(fact.body.map((field) => [field.name, field.value]));
  if (fact.kind !== FRAMED_SYNC_RESOURCE_FACT_KIND || fact.objectType !== 'node' || !fact.globalId ||
      fact.blobs.length !== 1 || fields.size !== 4 || fact.body.length !== 4) {
    throw new Error('framed_sync_resource_fact_invalid');
  }
  const bodyHash = stringField(fields, 'body_blob_hash');
  const demandId = stringField(fields, 'demand_id');
  const versionId = stringField(fields, 'version_id');
  const storageKey = stringField(fields, 'storage_key');
  const parsed = parseCanonicalAttachmentStorageKey(storageKey);
  const blob = fact.blobs[0]!;
  const role = parsed?.mimeType.startsWith('image/') ? 2 : parsed?.mimeType === 'application/pdf' ? 3 : 4;
  if (!/^[a-f0-9]{64}$/u.test(bodyHash) || !parsed || !blob.required || blob.role !== role ||
      blob.byteLength < 0n || blob.byteLength > BigInt(FRAMED_SYNC_LIMITS.maxBlobBytes) ||
      bytesToHex(assertFramedSyncDigest(blob.sha256, 'resource_hash')) !== parsed.contentHash ||
      fact.factId !== factId(versionId, parsed.contentHash)) {
    throw new Error('framed_sync_resource_fact_invalid');
  }
  assertFramedSyncDigest(fact.sharedStateHash, 'shared_state_hash');
  return {
    blob, bodyHash, demandId, globalId: fact.globalId, sharedStateHash: fact.sharedStateHash, versionId,
    resource: { contentHash: parsed.contentHash, role, storageKey: parsed.storageKey }
  };
}
