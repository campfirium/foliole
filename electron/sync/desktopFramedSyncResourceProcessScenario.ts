import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { serializeNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';
import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { openDatabaseConnection } from '../database/connection.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

export async function seedDesktopFramedSyncResourceScenario(input: Readonly<{
  bytes: Uint8Array;
  nodeId: string;
}>) {
  const now = '2026-10-05T00:00:00.000Z';
  const hash = createHash('sha256').update(input.bytes).digest('hex');
  const storageKey = buildCanonicalAttachmentStorageKey(hash, 'image/png');
  if (!storageKey) throw new Error('fixture_resource_storage_key_invalid');
  const assetsDir = resolveRuntimeDataPaths().assetsDir;
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(path.join(assetsDir, storageKey), input.bytes);
  upsertNodeSnapshot({
    anchorLink: null,
    content: 'Node with a binary resource',
    createdAt: now,
    isTitleManual: true,
    kind: 'item',
    nodeId: input.nodeId,
    parentNodeId: null,
    position: 0,
    reveal: null,
    title: 'Binary resource',
    updatedAt: now
  });
  openDatabaseConnection().driver.execute(`UPDATE nodes SET resource_references = ?, sync_dirty = 1
    WHERE id = ?`, [serializeNodeResourceReferences([{
    original_name: 'Cover.png', role: 'image', storage_key: storageKey
  }]), input.nodeId]);
  flushDirtyNodeSyncVersions();
  return { hash, storageKey };
}

export function seedDesktopFramedSyncResourceCommand(args: Readonly<Record<string, unknown>>) {
  if (!(args.bytes instanceof Uint8Array)) throw new Error('fixture_resource_bytes_invalid');
  return seedDesktopFramedSyncResourceScenario({ bytes: args.bytes, nodeId: String(args.nodeId) });
}
