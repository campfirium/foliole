import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

import {
  parseResourceNeeds,
  type ResourceClaim,
  type ResourceNeed
} from '../../lib/platform/resourceAvailabilityContract.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { loadCompanionAttachmentResource } from './companionLanAttachmentResources.js';

export async function hashResourceFile(filePath: string) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest('hex');
}

export async function loadResourceAvailability(bodyText: string) {
  const needs = parseResourceNeeds(JSON.parse(bodyText));
  const group = loadDesktopSyncGroup();
  if (!group) throw new Error('sync_group_not_available');
  const resources: ResourceClaim[] = [];
  for (const need of needs) resources.push(await inspectResource(need));
  return { provider_device_id: group.local_device_identity_key, resources };
}

async function inspectResource(need: ResourceNeed): Promise<ResourceClaim> {
  if (need.kind === 'content_blob') return inspectBlob(need);
  try {
    const resource = await loadCompanionAttachmentResource(need.id, need.id);
    if (resource.status !== 'ready') return { ...need, status: 'missing' };
    const sha256 = await hashResourceFile(resource.filePath);
    return sha256 === need.id
      ? { ...need, status: 'available', sha256, size_bytes: resource.contentLength }
      : { ...need, status: 'checksum_mismatch' };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...need, status: 'missing' };
    throw error;
  }
}

function inspectBlob(need: ResourceNeed): ResourceClaim {
  const row = openDatabaseConnection().driver.queryOne<{
    data: Buffer; stored_sha256: string; stored_size_bytes: number;
  }>(`SELECT cbd.data, cb.stored_sha256, cb.stored_size_bytes FROM content_blobs cb
      JOIN content_blob_data cbd ON cbd.hash = cb.hash WHERE cb.hash = ?`, [need.id]);
  if (!row) return { ...need, status: 'missing' };
  const sha256 = createHash('sha256').update(row.data).digest('hex');
  return sha256 === row.stored_sha256 && row.data.byteLength === row.stored_size_bytes
    ? { ...need, status: 'available', sha256, size_bytes: row.data.byteLength }
    : { ...need, status: 'checksum_mismatch' };
}
