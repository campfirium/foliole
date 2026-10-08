import { parseCanonicalAttachmentStorageKey } from '../../platform/attachmentResource.js';

import { FRAMED_SYNC_LIMITS } from './framedSyncContract.js';
import { digest, list, row, text, unique } from './framedSyncDecodedValues.js';
import type { FramedSyncResourceBinding } from './framedSyncResourceFact.js';

export type FramedSyncRequestedResource = FramedSyncResourceBinding & Readonly<{ storageKey: string }>;

export function readFramedSyncRequestedResources(value: unknown): readonly FramedSyncRequestedResource[] {
  const resources = list(value, FRAMED_SYNC_LIMITS.maxBlobsPerTransfer).map((item) => {
    const resource = row(item);
    const bodyHash = text(resource.bodyHash, 'resource_body_hash');
    const storageKey = text(resource.storageKey, 'resource_storage_key');
    if (!/^[a-f0-9]{64}$/u.test(bodyHash) || !parseCanonicalAttachmentStorageKey(storageKey)) {
      throw new Error('framed_sync_resource_request_invalid');
    }
    return { bodyHash, storageKey, demandId: text(resource.demandId, 'resource_demand_id'),
      globalId: text(resource.globalId, 'resource_global_id'), versionId: text(resource.versionId, 'resource_version_id'),
      sharedStateHash: digest(resource.sharedStateHash, 'resource_shared_state_hash').slice() };
  });
  unique(resources.map((resource) => resource.demandId), 'resource_demand_id');
  return resources;
}

export function projectFramedSyncResourceRequest(resources: readonly FramedSyncRequestedResource[], roundId: Uint8Array) {
  if (!resources.length) throw new Error('framed_sync_resource_request_empty');
  return { blobHashes: [], facts: [], resources, roundId };
}
