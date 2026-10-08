import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { buildCanonicalAttachmentStorageKey } from '../../lib/platform/attachmentResource.js';
import { upsertNodeSnapshot } from '../database/nodeMutations.js';
import { persistNodeResourceReference } from '../database/nodeResources.js';
import { flushDirtyNodeSyncVersions } from '../database/nodeSyncVersions.js';
import { resolveRuntimeDataPaths } from '../database/runtimeDataPaths.js';

import { hashResourceFile } from './resourceFileHash.js';

export async function seedDesktopFramedSyncResourceScenario(input: Readonly<{
  bytes?: Uint8Array;
  filePath?: string;
  includeImageInBody?: boolean;
  nodeId: string;
}>) {
  const now = '2026-10-05T00:00:00.000Z';
  if ((input.bytes === undefined) === (input.filePath === undefined)) throw new Error('fixture_resource_source_invalid');
  const hash = input.filePath === undefined
    ? createHash('sha256').update(input.bytes!).digest('hex') : await hashResourceFile(input.filePath);
  const storageKey = buildCanonicalAttachmentStorageKey(hash, 'image/png');
  if (!storageKey) throw new Error('fixture_resource_storage_key_invalid');
  const assetsDir = resolveRuntimeDataPaths().assetsDir;
  await fs.mkdir(assetsDir, { recursive: true });
  if (input.filePath !== undefined) await fs.copyFile(input.filePath, path.join(assetsDir, storageKey));
  else await fs.writeFile(path.join(assetsDir, storageKey), input.bytes!);
  upsertNodeSnapshot({
    anchorLink: null,
    content: input.includeImageInBody ? `Article with an image\n\n![Cover](asset://${storageKey})` : 'Node with a binary resource',
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
  persistNodeResourceReference(input.nodeId, {
    original_name: 'Cover.png', role: 'image', storage_key: storageKey
  });
  flushDirtyNodeSyncVersions();
  return { hash, storageKey };
}

export function seedDesktopFramedSyncResourceCommand(args: Readonly<Record<string, unknown>>) {
  const source = typeof args.filePath === 'string' ? { filePath: args.filePath }
    : args.bytes instanceof Uint8Array ? { bytes: args.bytes } : null;
  if (!source) throw new Error('fixture_resource_bytes_invalid');
  return seedDesktopFramedSyncResourceScenario({ ...source,
    includeImageInBody: args.includeImageInBody === true, nodeId: String(args.nodeId) });
}
