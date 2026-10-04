import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

import { expect } from 'vitest';

import { loadAttachmentResourceDescription } from '../database/attachmentResourceDescription.js';
import { openDatabaseConnection } from '../database/connection.js';

import { resolveAttachmentStoragePath } from './resourceResolver.js';

export function seedNode(nodeId: string) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (
         id,
         parent_id,
         title,
         is_title_manual,
         hide_title_heading,
         content,
         reveal,
         anchor_link,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(nodeId, null, nodeId, 1, 0, '', null, null, '2026-03-29T00:00:00.000Z', '2026-03-29T00:00:00.000Z', null);
}

export function countResourceReferences() {
  return openDatabaseConnection().driver.queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT json_extract(resource.value, '$.storage_key')) AS count
     FROM nodes, json_each(nodes.resource_references) resource`
  )?.count;
}

export function hashBytes(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createPngBytes() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01
  ]);
}

export async function expectAttachmentSyncState(nodeId: string, attachmentId: string, sizeBytes: number) {
  expect(openDatabaseConnection().driver.queryOne<{ content_hash: string; object_type: string; sync_dirty: number }>(
    `SELECT content_hash, object_type, sync_dirty FROM sync_object_state WHERE object_type = 'node' AND object_id = ?`,
    [nodeId]
  )).toEqual({ content_hash: expect.any(String), object_type: 'node', sync_dirty: 0 });
  const storageKey = `${attachmentId}.png`;
  expect((await fs.stat(resolveAttachmentStoragePath(attachmentId, undefined, 'image/png'))).size).toBe(sizeBytes);
  const version = openDatabaseConnection().driver.queryOne<{ snapshot_json: string }>(
    'SELECT snapshot_json FROM node_sync_versions WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = ?)', [nodeId]);
  expect(JSON.parse(JSON.parse(version?.snapshot_json ?? '{}').resource_references)).toEqual([
    { storage_key: storageKey, role: 'image', original_name: 'cover.png' }
  ]);
  expect(loadAttachmentResourceDescription(storageKey)).toEqual(expect.objectContaining({
    attachmentId,
    availability: 'local',
    contentHash: attachmentId,
    storageKey: `${attachmentId}.png`
  }));
}
