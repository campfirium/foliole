import { hexToBytes } from '@noble/hashes/utils.js';

import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';
import { parseNodeResourceReferences } from '../database/nodeResourceReferences.js';

import type { CanonicalBlob } from './framedSyncCanonicalManifest.js';

export type FramedSyncNodeResource = Readonly<{
  contentHash: string;
  role: 2 | 3 | 4;
  storageKey: string;
}>;

function wireRole(mimeType: string): FramedSyncNodeResource['role'] {
  if (mimeType.startsWith('image/')) return 2;
  if (mimeType === 'application/pdf') return 3;
  return 4;
}

export function readFramedSyncNodeResources(value: string | null | undefined) {
  const byHash = new Map<string, FramedSyncNodeResource>();
  for (const reference of parseNodeResourceReferences(value)) {
    const parsed = parseCanonicalAttachmentStorageKey(reference.storage_key);
    if (!parsed) throw new Error('node_resource_reference_invalid');
    const resource = {
      contentHash: parsed.contentHash,
      role: wireRole(parsed.mimeType),
      storageKey: parsed.storageKey
    } satisfies FramedSyncNodeResource;
    const prior = byHash.get(resource.contentHash);
    if (prior && (prior.role !== resource.role || prior.storageKey !== resource.storageKey)) {
      throw new Error('node_resource_blob_identity_conflict');
    }
    byHash.set(resource.contentHash, resource);
  }
  return [...byHash.values()].sort((left, right) =>
    left.contentHash.localeCompare(right.contentHash));
}

export function createFramedSyncNodeResourceBlob(
  resource: FramedSyncNodeResource,
  byteLength: bigint
): CanonicalBlob {
  return {
    byteLength,
    required: true,
    role: resource.role,
    sha256: hexToBytes(resource.contentHash)
  };
}
