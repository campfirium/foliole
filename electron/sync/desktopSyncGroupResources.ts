import { materializeCurrentVersionBodyBlobs } from '../../lib/core/sync/currentVersionBodyBlob.js';
import { loadNodeOwnedArticleResourceNeeds } from '../../lib/core/sync/nodeOwnedArticleResourceNeeds.js';
import { observeResourceProviders, transferResourceProviders } from '../../lib/core/sync/resourceProviderPass.js';
import { RESOURCE_AVAILABILITY_BATCH_LIMIT, takeContentBlobByteBatch,
  type ResourceNeed } from '../../lib/platform/resourceAvailabilityContract.js';
import { resolveAttachmentFileForSync } from '../attachments/resourceResolver.js';
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

async function loadResourceNeeds(articleIds: readonly string[], includeContentBlobs: boolean,
  forcedBlobHashes: readonly string[]) {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-group-resources' });
  const candidates = includeContentBlobs ? await port.query<ResourceBlobRow>(
    `SELECT cb.hash, cb.stored_sha256, cb.stored_size_bytes FROM content_blobs cb
     LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash
     WHERE cbd.hash IS NULL OR cb.hash IN (SELECT value FROM json_each(?))
     ORDER BY cb.hash LIMIT ?`, [JSON.stringify(forcedBlobHashes), RESOURCE_AVAILABILITY_BATCH_LIMIT]
  ) : [];
  if (candidates.length) await port.transaction((tx) => materializeCurrentVersionBodyBlobs(tx,
    { hashes: candidates.map((row) => row.hash) }));
  const remaining = candidates.length ? await port.query<{ hash: string }>(
    `SELECT hash FROM content_blob_data WHERE hash IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(candidates.map((row) => row.hash))]) : [];
  const present = new Set(remaining.map((row) => row.hash));
  const forced = new Set(forcedBlobHashes);
  const blobs = takeContentBlobByteBatch(
    candidates.filter((row) => !present.has(row.hash) || forced.has(row.hash)),
    (row) => row.stored_size_bytes);
  const { needs: attachments, unreadableArticleIds } = await loadNodeOwnedArticleResourceNeeds(port, articleIds);
  const missingAttachments = [];
  for (const attachment of attachments) {
    const resolved = resolveAttachmentFileForSync(attachment.storageKey);
    if (resolved.status === 'ready' &&
        await hashResourceFile(resolved.filePath).catch(() => null) === attachment.contentHash) continue;
    missingAttachments.push(attachment);
  }
  return { port, blobs, attachments: missingAttachments, unreadableArticleIds };
}

export async function downloadDesktopSyncGroupResources(peer: DesktopSyncGroupPeer,
  articleIds: readonly string[] = [], includeContentBlobs = true,
  forcedBlobHashes: readonly string[] = []) {
  const loaded = await runWithDatabaseConnectionOwner(() =>
    loadResourceNeeds(articleIds, includeContentBlobs, forcedBlobHashes));
  const blobs = new Map(loaded.blobs.map((blob) => [blob.hash, blob]));
  const attachments = new Map(loaded.attachments.map((attachment) => [attachment.attachmentId, attachment]));
  const needs: ResourceNeed[] = [
    ...[...blobs.keys()].map((id) => ({ kind: 'content_blob' as const, id })),
    ...[...attachments.values()].map((attachment) => ({ kind: 'attachment' as const, id: attachment.attachmentId, storage_key: attachment.storageKey }))
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
  const [remaining] = await runWithDatabaseConnectionOwner(() => loaded.port.query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM content_blobs cb
     LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL`
  ));
  return { failedStorageKeys, resourceResults, remainingContentBlobCount: remaining?.count ?? 0,
    unreadableArticleIds: loaded.unreadableArticleIds };
}
