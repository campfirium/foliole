import { loadArticleAttachmentNeeds } from '../../lib/core/sync/articleAttachmentNeeds.js';
import { observeResourceProviders, transferResourceProviders } from '../../lib/core/sync/resourceProviderPass.js';
import { RESOURCE_AVAILABILITY_BATCH_LIMIT, type ResourceNeed } from '../../lib/platform/resourceAvailabilityContract.js';
import { resolveAttachmentFile } from '../attachments/resourceResolver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection, runWithDatabaseConnectionOwner } from '../database/connection.js';

import { loadDesktopResourceProviders, loadEligibleResourceMemberIds, queryDesktopResourceAvailability } from './desktopResourceProviders.js';
import { transferDesktopResources, type ResourceBlobRow } from './desktopResourceTransfers.js';
import type { DesktopSyncGroupPeer } from './desktopSyncGroupRoutes.js';
import { hashResourceFile } from './resourceAvailability.js';

export function assertDesktopSyncGroupResourcesComplete() {
  const driver = openDatabaseConnection().driver;
  const missingBlobs = driver.queryOne<{ value: number }>(
    `SELECT COUNT(*) AS value FROM content_blobs cb
     LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL`
  )?.value ?? 0;
  if (missingBlobs) throw new Error('sync_group_resources_incomplete');
}

async function loadResourceNeeds(articleIds: readonly string[]) {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-group-resources' });
  const blobs = await port.query<ResourceBlobRow>(
    `SELECT cb.hash, cb.stored_sha256, cb.stored_size_bytes FROM content_blobs cb
     LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL ORDER BY cb.hash`
  );
  const { needs: attachments } = await loadArticleAttachmentNeeds(port, articleIds);
  const missingAttachments = [];
  for (const attachment of attachments) {
    const resolved = resolveAttachmentFile(attachment.storageKey);
    if (resolved.status === 'ready' &&
        await hashResourceFile(resolved.filePath).catch(() => null) === attachment.contentHash) continue;
    missingAttachments.push(attachment);
  }
  return { port, blobs, attachments: missingAttachments };
}

export async function downloadDesktopSyncGroupResources(peer: DesktopSyncGroupPeer, articleIds: readonly string[] = []) {
  const loaded = await runWithDatabaseConnectionOwner(() => loadResourceNeeds(articleIds));
  const blobs = new Map(loaded.blobs.map((blob) => [blob.hash, blob]));
  const attachments = new Map(loaded.attachments.map((attachment) => [attachment.attachmentId, attachment]));
  const needs: ResourceNeed[] = [
    ...[...blobs.keys()].map((id) => ({ kind: 'content_blob' as const, id })),
    ...[...attachments.keys()].map((id) => ({ kind: 'attachment' as const, id }))
  ];
  const failedStorageKeys: string[] = [];
  const resourceResults = [];
  for (let index = 0; index < needs.length; index += RESOURCE_AVAILABILITY_BATCH_LIMIT) {
    const batch = needs.slice(index, index + RESOURCE_AVAILABILITY_BATCH_LIMIT);
    const { providers } = await runWithDatabaseConnectionOwner(() => loadDesktopResourceProviders(peer));
    const observed = await observeResourceProviders({ providers, needs: batch, query: queryDesktopResourceAvailability });
    const eligibleDeviceIds = await runWithDatabaseConnectionOwner(() => loadEligibleResourceMemberIds(peer.group_id));
    const result = await transferResourceProviders({ ...observed, needs: batch, eligibleDeviceIds, refresh: queryDesktopResourceAvailability,
      transfer: async (provider, selected) => {
        const eligible = await runWithDatabaseConnectionOwner(() => loadEligibleResourceMemberIds(peer.group_id));
        if (!eligible.includes(provider.deviceId)) throw new Error('sync_group_device_not_active');
        return transferDesktopResources({ peer: provider, needs: selected, port: loaded.port, blobs, attachments });
      }
    });
    resourceResults.push({ ...result, issues: [...observed.issues, ...result.issues] });
    for (const key of result.unresolved) {
      if (key.startsWith('attachment:')) failedStorageKeys.push(attachments.get(key.slice('attachment:'.length))!.storageKey);
    }
    if (observed.issues.length || result.issues.length) console.warn('[sync] resource provider failures', {
      issues: [...observed.issues, ...result.issues]
    });
  }
  return { failedStorageKeys, resourceResults };
}
