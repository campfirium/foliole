import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveAttachmentStoragePath } from '../attachments/resourceResolver.js';
import { openDatabaseConnection } from '../database/connection.js';

import { boundedConcurrentMap } from './boundedConcurrentMap.js';
import { parseCompanionContentBlobMultipart } from './companionContentBlobMultipart.js';
import { createDesktopSyncGroupSignedHeaders } from './desktopSyncGroupHttp.js';

const CONTENT_BLOB_BATCH_SIZE = 32;
const ATTACHMENT_CONCURRENCY = 6;
const RESOURCE_TIMEOUT_MS = 30_000;

interface ResourcePeer {
  endpoint_url: string;
  group_id: string;
  local_device_id: string;
  secret: string;
}

interface BlobRow {
  [key: string]: null | number | string;
  hash: string;
  stored_sha256: string;
  stored_size_bytes: number;
}

interface AttachmentRow {
  [key: string]: null | number | string;
  attachment_id: string;
  content_hash: string;
}

export function assertDesktopSyncGroupResourcesComplete() {
  const driver = openDatabaseConnection().driver;
  const missingBlobs = driver.queryOne<{ value: number }>(
    `SELECT COUNT(*) AS value FROM content_blobs cb
     LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL`
  )?.value ?? 0;
  const missingAttachments = driver.queryOne<{ value: number }>(
    "SELECT COUNT(*) AS value FROM attachment_blobs WHERE availability != 'cached'"
  )?.value ?? 0;
  if (missingBlobs || missingAttachments) throw new Error('sync_group_resources_incomplete');
}

export async function downloadDesktopSyncGroupResources(peer: ResourcePeer) {
  const driver = openDatabaseConnection().driver;
  const blobs = driver.queryAll<BlobRow>(
    `SELECT cb.hash, cb.stored_sha256, cb.stored_size_bytes FROM content_blobs cb
     LEFT JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cbd.hash IS NULL ORDER BY cb.hash`
  );
  for (let index = 0; index < blobs.length; index += CONTENT_BLOB_BATCH_SIZE) {
    const wave = blobs.slice(index, index + CONTENT_BLOB_BATCH_SIZE);
    const downloaded = await downloadBlobBatch(peer, wave);
    driver.transaction(() => downloaded.forEach(({ blob, body }) => persistBlob(blob, body)));
  }
  const attachments = driver.queryAll<AttachmentRow>(
    `SELECT attachment_id, content_hash FROM attachment_blobs
     WHERE content_hash IS NOT NULL AND availability != 'cached' ORDER BY attachment_id`
  );
  for (let index = 0; index < attachments.length; index += ATTACHMENT_CONCURRENCY) {
    const wave = attachments.slice(index, index + ATTACHMENT_CONCURRENCY);
    await boundedConcurrentMap(wave, ATTACHMENT_CONCURRENCY, async (item) => {
      const downloaded = await downloadAttachment(peer, item);
      await persistAttachmentFile(downloaded);
      persistAttachmentRow(downloaded);
    });
  }
}

async function downloadBlobBatch(peer: ResourcePeer, blobs: BlobRow[]) {
  const pathWithQuery = '/companion/content-blobs';
  const requestBody = JSON.stringify({ hashes: blobs.map((blob) => blob.hash) });
  const response = await fetch(`${peer.endpoint_url}${pathWithQuery}`, {
    body: requestBody,
    headers: { ...createDesktopSyncGroupSignedHeaders({ body: requestBody, groupId: peer.group_id,
      localDeviceId: peer.local_device_id, method: 'POST', pathWithQuery, secret: peer.secret }),
      'Content-Type': 'application/json' },
    method: 'POST', signal: AbortSignal.timeout(RESOURCE_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`sync_resource_http_${response.status}`);
  const received = new Map(parseCompanionContentBlobMultipart(
    Buffer.from(await response.arrayBuffer()), response.headers.get('content-type')
  ).map((item) => [item.hash, item.body]));
  return blobs.map((blob) => {
    const body = received.get(blob.hash);
    if (!body || body.length !== blob.stored_size_bytes || sha256(body) !== blob.stored_sha256) {
      throw new Error('content_blob_checksum_mismatch');
    }
    return { blob, body };
  });
}

async function downloadAttachment(peer: ResourcePeer, attachment: AttachmentRow) {
  const query = new URLSearchParams({ attachment_id: attachment.attachment_id, content_hash: attachment.content_hash });
  const body = await downloadResource(peer, `/companion/attachment-resource?${query.toString()}`);
  if (sha256(body) !== attachment.content_hash) throw new Error('attachment_checksum_mismatch');
  return { attachment, body, filePath: resolveAttachmentStoragePath(attachment.attachment_id, undefined, null) };
}

function persistBlob(blob: BlobRow, body: Buffer) {
  const driver = openDatabaseConnection().driver;
  const now = new Date().toISOString();
  driver.execute('INSERT OR REPLACE INTO content_blob_data (hash, data) VALUES (?, ?)', [blob.hash, body]);
  driver.execute("UPDATE content_blobs SET availability = 'cached', cached_at = ?, last_verified_at = ? WHERE hash = ?",
    [now, now, blob.hash]);
}

async function persistAttachmentFile(input: Awaited<ReturnType<typeof downloadAttachment>>) {
  await fs.mkdir(path.dirname(input.filePath), { recursive: true });
  await fs.writeFile(`${input.filePath}.partial`, input.body);
  await fs.rename(`${input.filePath}.partial`, input.filePath);
}

function persistAttachmentRow(input: Awaited<ReturnType<typeof downloadAttachment>>) {
  const now = new Date().toISOString();
  openDatabaseConnection().driver.execute(
    "UPDATE attachment_blobs SET availability = 'cached', storage_key = ?, cached_at = ?, last_verified_at = ? WHERE attachment_id = ?",
    [path.basename(input.filePath), now, now, input.attachment.attachment_id]
  );
}

async function downloadResource(peer: ResourcePeer, pathWithQuery: string) {
  const response = await fetch(`${peer.endpoint_url}${pathWithQuery}`, {
    headers: createDesktopSyncGroupSignedHeaders({ groupId: peer.group_id, localDeviceId: peer.local_device_id,
      method: 'GET', pathWithQuery, secret: peer.secret }),
    signal: AbortSignal.timeout(RESOURCE_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`sync_resource_http_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function sha256(body: Buffer) {
  return createHash('sha256').update(body).digest('hex');
}
