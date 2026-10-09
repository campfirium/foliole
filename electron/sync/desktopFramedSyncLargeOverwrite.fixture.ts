import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { retainLocalEditBase } from '../../lib/core/sync/nodeVersionLocalEditHold.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { persistNodeResourceReference } from '../database/nodeResources.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

export const LARGE_OVERWRITE_PREFIX = 't326-large-overwrite-';
export const largeOverwriteNodeId = (index: number) => `${LARGE_OVERWRITE_PREFIX}${String(index).padStart(6, '0')}`;
export function largeOverwriteBody(index: number, pass: number) {
  const image = index < 100 ? `![Image](asset://${largeOverwriteAttachmentIdentity(index).storageKey})\n` : '';
  const prefix = `\ufeffNode ${index} version ${pass} 中文😀\0\n${image}`;
  return prefix + 'x'.repeat(8192 - Buffer.byteLength(prefix));
}
export function largeOverwriteAttachment(index: number) {
  const bytes = Buffer.alloc(64 * 1024, index);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.writeUInt32BE(index, 8);
  return bytes;
}
export function largeOverwriteAttachmentIdentity(index: number) {
  const hash = createHash('sha256').update(largeOverwriteAttachment(index)).digest('hex');
  const storageKey = buildCanonicalAttachmentStorageKey(hash, 'image/png');
  if (!storageKey) throw new Error('fixture_resource_storage_key_invalid');
  return { hash, storageKey };
}

/** Disposable fixed workload, using the same upsert/flush path as seedBatch. */
export async function seedLargeOverwriteFixture() {
  const connection = openDatabaseConnection(), db = createBetterSqliteDbPort(connection.sqlite);
  for (let pass = 0; pass < 3; pass++) {
    const now = new Date().toISOString();
    for (let index = 0; index < 1000; index++) {
      const nodeId = largeOverwriteNodeId(index);
      upsertNodeSnapshot({ anchorLink: null, content: largeOverwriteBody(index, pass), createdAt: now,
        isTitleManual: true, kind: 'topic', nodeId, parentNodeId: null, position: index,
        reveal: null, title: `Large overwrite ${index}`, updatedAt: now });
      if (pass === 0 && index < 100) await seedAttachment(index);
    }
    flushDirtyNodeSyncVersions(now);
    if (pass < 2) for (let index = 0; index < 1000; index++) {
      const nodeId = largeOverwriteNodeId(index);
      const row = connection.driver.queryOne<{ current_version_id: string }>(
        'SELECT current_version_id FROM nodes WHERE id = ?', [nodeId]);
      if (!row) throw new Error('fixture_node_missing');
      await retainLocalEditBase(db, { nodeId, versionId: row.current_version_id, holdId: `large:${index}:${pass}` });
    }
  }
  assertLargeSeed();
  return { nodeCount: 1000, readableVersions: 3000, bodyBytes: 8192, attachmentCount: 100, attachmentBytes: 65536 };
}

async function seedAttachment(index: number) {
  const { storageKey } = largeOverwriteAttachmentIdentity(index), assets = resolveRuntimeDataPaths().assetsDir;
  await fs.mkdir(assets, { recursive: true });
  await fs.writeFile(path.join(assets, storageKey), largeOverwriteAttachment(index));
  // This production API flushes this node's first version itself; the later dirty flush skips it.
  persistNodeResourceReference(largeOverwriteNodeId(index), { original_name: `Image-${index}.png`,
    role: 'image', storage_key: storageKey });
}

function assertLargeSeed() {
  const driver = openDatabaseConnection().driver;
  const rows = driver.queryAll<{ object_id: string; count: number; smallest: number; largest: number }>(
    `SELECT object_id, count(*) AS count, min(length(CAST(body_text AS BLOB))) AS smallest,
      max(length(CAST(body_text AS BLOB))) AS largest FROM node_sync_versions
      WHERE object_id LIKE ? AND body_text IS NOT NULL GROUP BY object_id`, [`${LARGE_OVERWRITE_PREFIX}%`]);
  if (rows.length !== 1000 || rows.some((row) => row.count !== 3 || row.smallest !== 8192 || row.largest !== 8192)) {
    throw new Error('fixture_large_body_contract_invalid');
  }
  const references = driver.queryAll<{ resource_references: string }>(
    'SELECT resource_references FROM nodes WHERE id LIKE ?', [`${LARGE_OVERWRITE_PREFIX}%`]);
  const hashes = new Set(references.flatMap((row) => {
    const refs: { storage_key: string }[] = JSON.parse(row.resource_references);
    return refs.map((ref) => ref.storage_key.slice(0, 64));
  }));
  if (hashes.size !== 100) throw new Error('fixture_large_attachment_contract_invalid');
}
