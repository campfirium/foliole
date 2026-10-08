import { randomUUID } from 'node:crypto';

import { loadFramedSyncPendingResourceRequests } from '../../lib/core/sync/framedSyncPendingResourceRequests.js';
import { scanFramedSyncResourceNeeds } from '../../lib/core/sync/framedSyncResourceNeedScan.js';
import { parseCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { resolveAttachmentFileForSync } from '../attachments/resourceResolver.js';

import { requestDesktopFramedSyncResourcesHttp } from './desktopFramedSyncDifferenceHttp.js';
import { receiveDesktopFramedSyncRoundStream, type InboundRound } from './desktopFramedSyncInboundRound.js';
import { hashResourceFile } from './resourceFileHash.js';

async function isPresent(storageKey: string) {
  const file = resolveAttachmentFileForSync(storageKey);
  return file.status === 'ready' && await hashResourceFile(file.filePath) ===
    parseCanonicalAttachmentStorageKey(storageKey)!.contentHash;
}

/** Called independently of database differences; each unavailable file leaves its own durable demand. */
export async function runDesktopFramedSyncResourceRound(input: InboundRound,
  globalIds: Iterable<string> | AsyncIterable<string>) {
  const receiver = { groupId: input.context.groupId, receiverDeviceId: input.context.initiatorDeviceId,
    receiverLibraryEpoch: input.context.initiatorLibraryEpoch };
  const result = { scanned: 0, unavailable: 0, pending: 0, transferred: 0 };
  for await (const globalId of globalIds) {
    const scanned = await scanFramedSyncResourceNeeds({ db: input.db, receiver, globalIds: [globalId], isPresent, createId: randomUUID });
    result.scanned += scanned.scanned; result.unavailable += scanned.unavailable;
    result.pending += scanned.unavailable;
    let after = '';
    for (;;) {
      const page = await loadFramedSyncPendingResourceRequests(input.db, receiver, after, globalId);
      result.pending += page.unavailableDemandIds.length;
      for (const resource of page.resources) {
        try {
          const stream = await requestDesktopFramedSyncResourcesHttp({ ...input, resources: [resource] });
          await receiveDesktopFramedSyncRoundStream(input, stream);
          result.transferred += 1;
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('framed_sync_resource_source_unavailable')) throw error;
          result.pending += 1;
        }
      }
      if (page.afterId === null) break;
      after = page.afterId;
    }
  }
  return result;
}
