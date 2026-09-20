import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { loadArticleAttachmentNeeds, type ArticleAttachmentNeed } from '../../lib/core/sync/articleAttachmentNeeds.js';
import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { resolveAttachmentFile, resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

import { boundedConcurrentMap } from './boundedConcurrentMap.js';
import { parseCompanionContentBlobMultipart } from './companionContentBlobMultipart.js';
import {
  createDesktopSyncGroupSignedHeaders,
  createDesktopWorkgroupPost,
  readDesktopWorkgroupResponse
} from './desktopSyncGroupHttp.js';
import { loadDesktopWorkgroupKey } from './workgroupKeyStore.js';

const CONTENT_BLOB_BATCH_SIZE = 32;
const ATTACHMENT_CONCURRENCY = 6;
const RESOURCE_TIMEOUT_MS = 30_000;

interface ResourcePeer {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
}

interface BlobRow {
  [key: string]: null | number | string;
  hash: string;
  stored_sha256: string;
  stored_size_bytes: number;
}

export function assertDesktopSyncGroupResourcesComplete() {
  const driver = openDatabaseConnection().driver;
  const missingBlobs = driver.queryOne<{ value: number }>(
    `SELECT COUNT(*) AS value FROM content_blobs cb
     LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL`
  )?.value ?? 0;
  if (missingBlobs) throw new Error('sync_group_resources_incomplete');
}

export async function downloadDesktopSyncGroupResources(peer: ResourcePeer, articleIds: readonly string[] = []) {
  const port = createBetterSqliteDbPort(openDatabaseConnection().sqlite, { name: 'desktop-sync-group-resources' });
  const blobs = await port.query<BlobRow>(
    `SELECT cb.hash, cb.stored_sha256, cb.stored_size_bytes FROM content_blobs cb
     LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL ORDER BY cb.hash`
  );
  for (let index = 0; index < blobs.length; index += CONTENT_BLOB_BATCH_SIZE) {
    const wave = blobs.slice(index, index + CONTENT_BLOB_BATCH_SIZE);
    const downloaded = await downloadBlobBatch(peer, wave);
    await port.transaction(async (tx) => {
      for (const { blob, body } of downloaded) await persistBlob(tx, blob, body);
    });
  }
  const { needs } = await loadArticleAttachmentNeeds(port, articleIds);
  const failedStorageKeys: string[] = [];
  await boundedConcurrentMap(needs, ATTACHMENT_CONCURRENCY, async (item) => {
    if (resolveAttachmentFile(item.storageKey).status === 'ready') return;
    try {
      const downloaded = await downloadAttachment(peer, item);
      await persistAttachmentFile(downloaded);
    } catch (error) {
      failedStorageKeys.push(item.storageKey);
      console.warn('[sync] article attachment remains missing', { storageKey: item.storageKey, error });
    }
  });
  return { failedStorageKeys };
}

async function downloadBlobBatch(peer: ResourcePeer, blobs: BlobRow[]) {
  const pathWithQuery = '/companion/content-blobs';
  const requestBody = JSON.stringify({ hashes: blobs.map((blob) => blob.hash) });
  const encrypted = createDesktopWorkgroupPost({ body: requestBody, groupId: peer.group_id,
    localDeviceId: peer.local_device_id, pathWithQuery, secret: requireGroupKey(peer.group_id) });
  const response = await fetch(`${peer.endpoint_url}${pathWithQuery}`, {
    body: encrypted.body,
    headers: encrypted.headers,
    method: 'POST', signal: AbortSignal.timeout(RESOURCE_TIMEOUT_MS)
  });
  const body = await readDesktopWorkgroupResponse({
    contentType: response.headers.get('x-foliole-original-content-type') ?? 'multipart/mixed',
    groupId: peer.group_id, method: 'POST', pathWithQuery, response
  });
  const received = new Map(parseCompanionContentBlobMultipart(
    body, response.headers.get('x-foliole-original-content-type')
  ).map((item) => [item.hash, item.body]));
  return blobs.map((blob) => {
    const body = received.get(blob.hash);
    if (!body || body.length !== blob.stored_size_bytes || sha256(body) !== blob.stored_sha256) {
      throw new Error('content_blob_checksum_mismatch');
    }
    return { blob, body };
  });
}

async function downloadAttachment(peer: ResourcePeer, attachment: ArticleAttachmentNeed) {
  const query = new URLSearchParams({ attachment_id: attachment.attachmentId, content_hash: attachment.contentHash });
  const body = await downloadResource(peer, `/companion/attachment-resource?${query.toString()}`);
  if (sha256(body) !== attachment.contentHash) throw new Error('attachment_checksum_mismatch');
  return { attachment, body, filePath: resolveAttachmentStoragePath(
    attachment.contentHash, undefined, attachment.mimeType
  ) };
}

async function persistBlob(port: DbPort, blob: BlobRow, body: Buffer) {
  const now = new Date().toISOString();
  await port.run('INSERT OR REPLACE INTO content_blob_data (hash, data) VALUES (?, ?)', [blob.hash, body]);
  await port.run("UPDATE content_blobs SET availability = 'cached', cached_at = ?, last_verified_at = ? WHERE hash = ?",
    [now, now, blob.hash]);
}

async function persistAttachmentFile(input: Awaited<ReturnType<typeof downloadAttachment>>) {
  await fs.mkdir(path.dirname(input.filePath), { recursive: true });
  await fs.writeFile(`${input.filePath}.partial`, input.body);
  await fs.rename(`${input.filePath}.partial`, input.filePath);
}

async function downloadResource(peer: ResourcePeer, pathWithQuery: string) {
  const response = await fetch(`${peer.endpoint_url}${pathWithQuery}`, {
    headers: createDesktopSyncGroupSignedHeaders({ groupId: peer.group_id,
      localDeviceId: peer.local_device_id,
      method: 'GET', pathWithQuery, secret: requireGroupKey(peer.group_id) }),
    signal: AbortSignal.timeout(RESOURCE_TIMEOUT_MS)
  });
  return readDesktopWorkgroupResponse({
    contentType: response.headers.get('x-foliole-original-content-type') ?? 'application/octet-stream',
    groupId: peer.group_id, method: 'GET', pathWithQuery, response
  });
}

function sha256(body: Buffer) {
  return createHash('sha256').update(body).digest('hex');
}

function requireGroupKey(groupId: string) {
  const key = loadDesktopWorkgroupKey(groupId);
  if (!key) throw new Error('sync_group_workgroup_key_missing');
  return key.group_key;
}
