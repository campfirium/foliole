import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ArticleAttachmentNeed } from '../../lib/core/sync/articleAttachmentNeeds.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import type { ResourceTransfer } from '../../lib/core/sync/resourceProviderPass.js';
import { classifyResourceFailure, resourceKey, type ResourceNeed } from '../../lib/platform/resourceAvailabilityContract.js';
import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { boundedConcurrentMap } from './boundedConcurrentMap.js';
import { parseCompanionContentBlobMultipart } from './companionContentBlobMultipart.js';
import { requireResourceGroupKey, type DesktopResourceProvider } from './desktopResourceProviders.js';
import { createDesktopSyncGroupSignedHeaders, createDesktopWorkgroupPost, readDesktopWorkgroupResponse } from './desktopSyncGroupHttp.js';

export interface ResourceBlobRow {
  [key: string]: null | number | string;
  hash: string;
  stored_sha256: string;
  stored_size_bytes: number;
}

export async function transferDesktopResources(args: {
  peer: DesktopResourceProvider; needs: readonly ResourceNeed[]; port: DbPort;
  blobs: ReadonlyMap<string, ResourceBlobRow>; attachments: ReadonlyMap<string, ArticleAttachmentNeed>;
}): Promise<ResourceTransfer> {
  const result: ResourceTransfer = { ready: [], errors: {} };
  const blobs = args.needs.filter((need) => need.kind === 'content_blob');
  if (blobs.length) await transferBlobs(args.peer, blobs, args.blobs, args.port, result);
  await boundedConcurrentMap(args.needs.filter((need) => need.kind === 'attachment'), 6, async (need) => {
    const key = resourceKey(need);
    try {
      const attachment = args.attachments.get(need.id);
      if (!attachment) throw new Error('resource_request_invalid');
      await transferAttachment(args.peer, attachment);
      result.ready.push(key);
    } catch (error) { result.errors[key] = classifyResourceFailure(error); }
  });
  return result;
}

async function transferBlobs(peer: DesktopResourceProvider, needs: ResourceNeed[],
  blobs: ReadonlyMap<string, ResourceBlobRow>, port: DbPort, result: ResourceTransfer) {
  const received = new Map<string, Buffer[]>();
  try {
    const { body, contentType } = await download(peer, '/companion/content-blobs', { hashes: needs.map((need) => need.id) });
    for (const item of parseCompanionContentBlobMultipart(body, contentType)) {
      received.set(item.hash, [...(received.get(item.hash) ?? []), item.body]);
    }
  } catch (error) {
    for (const need of needs) result.errors[resourceKey(need)] = classifyResourceFailure(error);
    return;
  }
  for (const need of needs) {
    const key = resourceKey(need), blob = blobs.get(need.id), parts = received.get(need.id);
    if (parts && parts.length !== 1) { result.errors[key] = 'protocol_error'; continue; }
    const body = parts?.[0];
    if (!body) { result.errors[key] = 'missing_file'; continue; }
    if (!blob || body.length !== blob.stored_size_bytes || sha256(body) !== blob.stored_sha256) {
      result.errors[key] = 'checksum_mismatch'; continue;
    }
    try {
      await runWithDatabaseConnectionOwner(() => port.transaction(async (tx) => {
        const now = new Date().toISOString();
        await tx.run('INSERT OR REPLACE INTO content_blob_data (hash, data) VALUES (?, ?)', [blob.hash, body]);
        await tx.run("UPDATE content_blobs SET availability = 'cached', cached_at = ?, last_verified_at = ? WHERE hash = ?",
          [now, now, blob.hash]);
      }));
      result.ready.push(key);
    } catch { result.errors[key] = 'protocol_error'; }
  }
}

async function transferAttachment(peer: DesktopResourceProvider, attachment: ArticleAttachmentNeed) {
  const query = new URLSearchParams({ attachment_id: attachment.attachmentId, content_hash: attachment.contentHash });
  const { body } = await download(peer, `/companion/attachment-resource?${query.toString()}`);
  if (sha256(body) !== attachment.contentHash) throw new Error('attachment_checksum_mismatch');
  const filePath = resolveAttachmentStoragePath(attachment.contentHash, undefined, attachment.mimeType);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.partial`;
  try {
    await fs.writeFile(temporary, body);
    await fs.rename(temporary, filePath);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function download(peer: DesktopResourceProvider, pathWithQuery: string, payload?: unknown) {
  const method = payload ? 'POST' : 'GET';
  const init = await runWithDatabaseConnectionOwner(() => {
    const args = { groupId: peer.group_id, localDeviceId: peer.local_device_id, pathWithQuery,
      secret: requireResourceGroupKey(peer.group_id) };
    return payload ? createDesktopWorkgroupPost({ ...args, body: JSON.stringify(payload) })
      : { headers: createDesktopSyncGroupSignedHeaders({ ...args, method }) };
  });
  const response = await fetch(`${peer.endpoint_url}${pathWithQuery}`, {
    ...init, method, signal: AbortSignal.timeout(30_000)
  });
  const contentType = response.headers.get('x-foliole-original-content-type');
  const body = await readDesktopWorkgroupResponse({
    contentType: contentType ?? 'application/octet-stream', groupId: peer.group_id, method, pathWithQuery, response
  });
  return { body, contentType };
}

function sha256(body: Buffer) { return createHash('sha256').update(body).digest('hex'); }
