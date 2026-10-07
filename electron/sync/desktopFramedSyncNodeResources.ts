import {
  createFramedSyncNodeResourceBlob,
  readFramedSyncNodeResources
} from '../../lib/core/sync/framedSyncNodeResources.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { resolveAttachmentFileForSync } from '../attachments/resourceResolver.js';

export type DesktopFramedSyncNodeResource = Readonly<{
  blob: ReturnType<typeof createFramedSyncNodeResourceBlob>;
  filePath: string;
  storageKey: string;
}>;

export function resolveDesktopFramedSyncNodeResources(
  record: Readonly<{ snapshot: Pick<NativeSyncNodeRecord['snapshot'], 'resource_references'> }>
): readonly DesktopFramedSyncNodeResource[] {
  return readFramedSyncNodeResources(record.snapshot.resource_references).map((resource) => {
    const resolved = resolveAttachmentFileForSync(resource.storageKey);
    if (resolved.status !== 'ready' || !Number.isSafeInteger(resolved.sizeBytes) ||
        resolved.sizeBytes < 0) {
      throw new Error('framed_sync_outbound_resource_unavailable');
    }
    return {
      blob: createFramedSyncNodeResourceBlob(resource, BigInt(resolved.sizeBytes)),
      filePath: resolved.filePath,
      storageKey: resource.storageKey
    };
  });
}
