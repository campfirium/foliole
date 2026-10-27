import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { isCanonicalTrashedNodeId, isCanonicalVisibleNodeId } from '../../../workspaceCanonicalSelectors';

type Node = WorkspaceSnapshot['nodesById'][string];
const annotationIndexes = new WeakMap<WorkspaceSnapshot['nodesById'], Map<string, string[]>>();

function annotationIds(nodes: WorkspaceSnapshot['nodesById'], parentId: string) {
  let index = annotationIndexes.get(nodes);
  if (!index) {
    index = new Map();
    // Catalog structure is replaced with nodesById; content facts remain checked on every demand.
    for (const node of Object.values(nodes)) {
      if (!node.anchorLink || !node.parentNodeId) continue;
      const children = index.get(node.parentNodeId) ?? [];
      children.push(node.id);
      index.set(node.parentNodeId, children);
    }
    for (const children of index.values()) children.sort((a, b) => a.localeCompare(b));
    annotationIndexes.set(nodes, index);
  }
  return index.get(parentId) ?? [];
}

function contentFacts(node: Node) {
  return [node.id, node.currentVersionId, node.bodyBlobHash, node.bodyStatus, node.content,
    node.reveal, node.title, node.hideTitleHeading, node.anchorLink, node.parentNodeId,
    node.deletedAt, node.attachments, node.imageRegions, node.imageSources];
}

export function hasCompanionReadingDemand(snapshot: WorkspaceSnapshot | null, nodeId: string | null) {
  return Boolean(snapshot && nodeId && (isCanonicalVisibleNodeId(snapshot, nodeId)
    || isCanonicalTrashedNodeId(snapshot, nodeId)));
}

export function companionReadingDemandKey(snapshot: WorkspaceSnapshot | null, nodeId: string | null) {
  if (!snapshot || !nodeId || !snapshot.nodesById[nodeId]) return null;
  const visible = isCanonicalVisibleNodeId(snapshot, nodeId);
  const trashed = isCanonicalTrashedNodeId(snapshot, nodeId);
  if (!visible && !trashed) return null;
  const annotations = annotationIds(snapshot.nodesById, nodeId)
    .map((id) => [contentFacts(snapshot.nodesById[id]!), isCanonicalTrashedNodeId(snapshot, id)]);
  return JSON.stringify([snapshot.libraryScope, visible, trashed, contentFacts(snapshot.nodesById[nodeId]), annotations]);
}

export class CompanionReadingSnapshotChanged extends Error {
  constructor() { super('The article changed while loading. Refresh the current workspace.'); }
}
