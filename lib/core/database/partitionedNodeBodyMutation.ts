import { splitImportBody } from '../import/importBodySegments.js';
import { TEXT_BODY_MAX_BYTES, utf8ByteLength } from '../nodes/textBodyBudget.js';

import { fittingBodyPartAnchorIndex, protectedBodyPartAnchorSpans } from './bodyPartAnchorPlacement.js';
import { bodyAnchorRanges, offsetBodyAnchor } from './bodyPartitionAnchors.js';
import { bodyPartNodeId, bodyPartPrefix } from './bodyPartitionIdentity.js';
import type { DatabaseDriver, DatabaseRow } from './driver.js';
import { writeNodeBody } from './nodeBodyMutation.js';
import { loadNodeBodyResolution, NodeBodyUnavailableError } from './nodeBodyResolution.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { ensureNodeParentMembership } from './nodeOrderMutations.js';
import { readBodyPartIds, readPartitionedNodeBody } from './partitionedNodeBody.js';
import { enqueueWorkspaceSearchInvalidationForNodeIds } from './searchIndexInvalidations.js';

interface AnchoredChild extends DatabaseRow {
  id: string;
  anchor_link: string;
}

interface PartitionNode extends DatabaseRow {
  id: string;
  title: string;
  image_sources: string;
  resource_references: string;
}

export function expandPartitionedNodeForImport(driver: DatabaseDriver, nodeId: string, now: string) {
  const partIds = readBodyPartIds(driver, nodeId);
  if (!partIds.length) return;
  const content = readPartitionedNodeBody(driver, nodeId);
  const rootBody = loadNodeBodyResolution(driver, nodeId);
  if (!rootBody) throw new NodeBodyUnavailableError([nodeId]);
  let offset = rootBody.content.length;
  for (const id of partIds) {
    expandPartitionedNodeForImport(driver, id, now);
    const body = loadNodeBodyResolution(driver, id);
    if (!body) throw new NodeBodyUnavailableError([id]);
    for (const child of readAnchoredChildren(driver, id)) {
      const anchor = bodyAnchorRanges(child.anchor_link).length
        ? offsetBodyAnchor(child.anchor_link, offset) : child.anchor_link;
      moveAnchor(driver, child.id, nodeId, anchor, now);
    }
    offset += body.content.length;
    retireUnusedParts(driver, id, [], now);
  }
  const node = driver.queryOne<PartitionNode>('SELECT id, title FROM nodes WHERE id = ?', [nodeId]);
  if (!node) throw new Error('body_partition_source_missing');
  writeNodeBody({ driver, nodeId, title: node.title, content, updatedAt: now });
}

function readAnchoredChildren(driver: DatabaseDriver, parentId: string) {
  return driver.queryAll<AnchoredChild>(
    'SELECT id, anchor_link FROM nodes WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL', [parentId]);
}

function moveAnchor(driver: DatabaseDriver, id: string, parentId: string, anchor: string, now: string) {
  driver.execute('UPDATE nodes SET parent_id = ?, anchor_link = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?',
    [parentId, anchor, now, id]);
  ensureNodeParentMembership(driver, id);
}

function writePart(driver: DatabaseDriver, node: PartitionNode, content: string, index: number, now: string) {
  const id = bodyPartNodeId(node.id, index);
  const existing = driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id = ?', [id]);
  if (existing) {
    driver.execute('UPDATE nodes SET parent_id = ?, deleted_at = NULL, sync_dirty = 1 WHERE id = ?', [node.id, id]);
    writeNodeBody({ driver, nodeId: id, title: existing.title, content, updatedAt: now });
    ensureNodeParentMembership(driver, id);
  } else {
    upsertNodeSnapshot(driver, {
      nodeId: id, parentNodeId: node.id, kind: 'topic', title: `${node.title} (${index + 1})`,
      isTitleManual: true, content, reveal: null, anchorLink: null, position: null, createdAt: now, updatedAt: now
    }, {  });
  }
  driver.execute('UPDATE nodes SET image_sources = ?, resource_references = ? WHERE id = ?',
    [node.image_sources, node.resource_references, id]);
  return id;
}

function retireUnusedParts(driver: DatabaseDriver, nodeId: string, retainedIds: string[], now: string) {
  const oldIds = readBodyPartIds(driver, nodeId).filter((id) => !retainedIds.includes(id));
  for (const id of oldIds) {
    const children = driver.queryAll<{ id: string }>('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [id]);
    for (const child of children) {
      driver.execute('UPDATE nodes SET parent_id = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?', [nodeId, now, child.id]);
      ensureNodeParentMembership(driver, child.id);
    }
    driver.execute('UPDATE nodes SET deleted_at = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?', [now, now, id]);
  }
  enqueueWorkspaceSearchInvalidationForNodeIds(driver, oldIds);
}

/** The caller owns the import/edit transaction; temporary expansion is never committed. */
export function partitionStoredNodeBody(driver: DatabaseDriver, nodeId: string, now: string) {
  return driver.transaction(() => {
    const node = driver.queryOne<PartitionNode>(
      'SELECT id, title, image_sources, resource_references FROM nodes WHERE id = ?', [nodeId]);
    if (!node) throw new Error('body_partition_source_missing');
    const body = loadNodeBodyResolution(driver, nodeId);
    if (!body) throw new NodeBodyUnavailableError([nodeId]);
    if (utf8ByteLength(body.content) <= TEXT_BODY_MAX_BYTES) {
      if (body.content && readBodyPartIds(driver, nodeId).length) retireUnusedParts(driver, nodeId, [], now);
      return [];
    }
    const anchors = readAnchoredChildren(driver, nodeId);
    const parts = splitImportBody(body.content, TEXT_BODY_MAX_BYTES, protectedBodyPartAnchorSpans(body.content, anchors.map(anchor => anchor.anchor_link)));
    const placements = anchors.map((anchor) => ({ anchor, index: fittingBodyPartAnchorIndex(anchor.anchor_link, parts) }));
    const ids = parts.map((part, index) => writePart(driver, node, part.content, index, now));
    for (const { anchor, index } of placements) {
      const part = parts[index];
      const id = ids[index];
      if (part && id) moveAnchor(driver, anchor.id, id, offsetBodyAnchor(anchor.anchor_link, -part.from), now);
    }
    writeNodeBody({ driver, nodeId, title: node.title, content: '', updatedAt: now });
    retireUnusedParts(driver, nodeId, ids, now);
    enqueueWorkspaceSearchInvalidationForNodeIds(driver, [nodeId, ...ids, ...anchors.map((anchor) => anchor.id)]);
    return ids;
  });
}

export function isBodyPartNode(parentId: string, nodeId: string) {
  return nodeId.startsWith(bodyPartPrefix(parentId));
}
