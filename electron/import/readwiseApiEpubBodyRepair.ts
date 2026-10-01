import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import type { NodeResourceReference } from '../../lib/core/database/nodeResourceReferences.js';
import {
  prepareReadwiseApiDocuments,
  stableReadwiseEpubNodeId
} from '../../lib/core/readwise/readwiseApiImport.js';
import { openDatabaseConnection } from '../database/connection.js';
import { loadOrCreateDesktopHostName } from '../database/hostProfile.js';
import { registerNodeImageSources } from '../database/nodeImageSources.js';
import { loadNodeResourceReferences } from '../database/nodeResources.js';
import { flushNodeSyncVersion } from '../database/nodeSyncVersions.js';

import { buildReadwiseApiEpubBookNodes } from './readwiseApiEpubBookTree.js';
import { isReadwiseApiEpubCoverLine } from './readwiseApiEpubCoverBody.js';
import type { ReadwiseApiEpubCoverRemote } from './readwiseApiEpubCoverRepair.js';
import { replaceReadwiseApiEpubImageLinks } from './readwiseApiEpubImageLinks.js';
import { prepareReadwiseApiEpubImages } from './readwiseApiEpubImages.js';
import { loadReadwiseSourceResyncTarget } from './readwiseSourceResyncTarget.js';

interface ReadwiseApiEpubBodyRemote extends ReadwiseApiEpubCoverRemote {
  author?: string | null;
  createdAt?: string | null;
  htmlContent: string | null;
  sourceUrl?: string | null;
  updatedAt?: string | null;
  url?: string | null;
}

export async function repairReadwiseApiEpubBodiesFromRemote(
  nodeId: string,
  remote: ReadwiseApiEpubBodyRemote
) {
  const target = loadReadwiseSourceResyncTarget(nodeId);
  if (!target || target.documentId !== remote.id) throw new Error('readwise_body_repair_target_missing');
  const prepared = prepareReadwiseApiDocuments([toContract(remote, target.title)], [])[0];
  if (!prepared?.epubStructure) throw new Error('readwise_body_repair_structure_missing');
  const images = await prepareReadwiseApiEpubImages(prepared);
  if (!images) return { nodeId, status: 'unchanged' as const };
  const before = readCurrentBodies(nodeId);
  const desired = buildReadwiseApiEpubBodyOverwrite(target, before, images);
  commitBodies(before, desired);
  return {
    accounting: images.accounting,
    degradedReason: images.degradedReason,
    nodeId,
    status: desired.some((item) => item.content !== before.get(item.nodeId)!.content)
      ? 'repaired' as const : 'unchanged' as const
  };
}

function toContract(remote: ReadwiseApiEpubBodyRemote, title: string) {
  return {
    author: remote.author ?? null, category: remote.category === 'epub' ? 'epub' as const : null,
    createdAt: remote.createdAt ?? null, htmlContent: remote.htmlContent, id: remote.id,
    imageUrl: remote.imageUrl, notes: null, parentId: null, rawSourceUrl: null,
    sourceUrl: remote.sourceUrl ?? null, summary: null, title,
    updatedAt: remote.updatedAt ?? null, url: remote.url ?? null
  };
}

function readCurrentBodies(rootNodeId: string) {
  const rows = openDatabaseConnection().driver.queryAll<{
    content: string;
    id: string;
    title: string;
  }>(`WITH RECURSIVE tree(id, content, title) AS (
      SELECT id, content, title FROM nodes WHERE id = ? AND deleted_at IS NULL
      UNION ALL SELECT child.id, child.content, child.title FROM nodes child
      JOIN tree ON child.parent_id = tree.id WHERE child.deleted_at IS NULL
    ) SELECT id, content, title FROM tree WHERE id = ? OR id LIKE 'node-epub-%'`,
  [rootNodeId, rootNodeId]);
  return new Map(rows.map((row) => [row.id, row]));
}

export function buildReadwiseApiEpubBodyOverwrite(
  target: Pick<NonNullable<ReturnType<typeof loadReadwiseSourceResyncTarget>>,
    'connectionRef' | 'documentId' | 'nodeId' | 'title'>,
  before: ReturnType<typeof readCurrentBodies>,
  images: NonNullable<Awaited<ReturnType<typeof prepareReadwiseApiEpubImages>>>
) {
  const root = before.get(target.nodeId);
  if (!root) throw new Error('readwise_body_repair_root_missing');
  const desired = [{
    resourceReferences: retainedRootResources(target.nodeId, root.content, images.rootResourceReferences ?? []),
    imageSources: images.rootImageSources ?? {},
    content: rebuildRoot(root.content, target.title, images.rootBody),
    nodeId: target.nodeId,
    title: target.title
  }];
  for (const node of buildReadwiseApiEpubBookNodes(images.sections)) {
    const nodeId = stableReadwiseEpubNodeId(target.connectionRef, target.documentId, node.key);
    const current = before.get(nodeId);
    if (!current) throw new Error(`readwise_body_repair_node_missing:${nodeId}`);
    desired.push({ imageSources: node.imageSources ?? {}, resourceReferences: node.resourceReferences ?? [], content: node.content, nodeId, title: current.title });
  }
  if (desired.length !== before.size) throw new Error('readwise_body_repair_node_scope_changed');
  return desired;
}

function rebuildRoot(current: string, title: string, body: string) {
  const blocks = current.trim().split(/\n{2,}/u);
  const trailing = /^\[Open in Reader\]/u.test(blocks.at(-1) ?? '') ? blocks.pop() : null;
  const heading = blocks[0]?.match(/^#{1,6}\s+(.+)$/u)?.[1]?.trim() === title ? blocks.shift() : null;
  const cover = blocks.find(isReadwiseApiEpubCoverLine) ?? null;
  return [heading, cover, body, trailing].filter(Boolean).join('\n\n');
}

function retainedRootResources(rootNodeId: string, content: string, bodyResources: readonly NodeResourceReference[]) {
  const retained = loadNodeResourceReferences(rootNodeId).filter((reference) =>
    reference.role === 'image' && content.includes(`asset://${reference.storage_key}`));
  return [...new Map([...retained, ...bodyResources].map((reference) => [reference.storage_key, reference])).values()];
}

function commitBodies(
  before: ReturnType<typeof readCurrentBodies>,
  desired: ReturnType<typeof buildReadwiseApiEpubBodyOverwrite>
) {
  const driver = openDatabaseConnection().driver;
  const now = new Date().toISOString();
  driver.transaction(() => {
    const current = readCurrentBodies(desired[0]!.nodeId);
    for (const item of desired) {
      if (current.get(item.nodeId)?.content !== before.get(item.nodeId)?.content) {
        throw new Error('readwise_body_repair_target_changed');
      }
      writeNodeBody({ content: item.content, driver, nodeId: item.nodeId, title: item.title, updatedAt: now });
      driver.execute(`UPDATE nodes SET last_modified_by_host_name = ?, sync_dirty = 1 WHERE id = ?`,
        [loadOrCreateDesktopHostName(now), item.nodeId]);
      replaceReadwiseApiEpubImageLinks(item.nodeId, item.resourceReferences);
      registerNodeImageSources(item.nodeId, item.imageSources);
      flushNodeSyncVersion(item.nodeId, now);
    }
  });
}
