import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { FramedSyncContext } from '../../lib/core/sync/framedSyncContract.js';
import { publishFramedSyncResourceOutbound } from '../../lib/core/sync/framedSyncResourceOutbound.js';
import { readFramedSyncRequestedResources, type FramedSyncRequestedResource } from '../../lib/core/sync/framedSyncResourceRequest.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { resolveAttachmentFileForSync } from '../attachments/resourceResolver.js';

import { hashResourceFile } from './resourceFileHash.js';

/** Authenticated members request bytes for their own adopted content, independently of database differences. */
export async function publishDesktopFramedSyncResourceOutbound(input: {
  context: FramedSyncContext; db: DbPort; resources: readonly FramedSyncRequestedResource[];
}) {
  const resources = readFramedSyncRequestedResources(input.resources);
  if (!resources.length || resources.some((resource) => resource.globalId !== resources[0]!.globalId)) {
    throw new Error('framed_sync_resource_unit_invalid');
  }
  const sources = [];
  for (const demand of resources) {
    const parsed = parseCanonicalAttachmentStorageKey(demand.storageKey)!;
    const file = resolveAttachmentFileForSync(demand.storageKey);
    if (file.status !== 'ready' || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0 ||
        await hashResourceFile(file.filePath) !== parsed.contentHash) {
      throw new Error('framed_sync_resource_source_unavailable');
    }
    sources.push({ demand, byteLength: BigInt(file.sizeBytes) });
  }
  return (await publishFramedSyncResourceOutbound({ ...input, sources })).publication;
}
