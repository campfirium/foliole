import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { isCanonicalTrashedNodeId, isCanonicalVisibleNodeId } from '../../../workspaceCanonicalSelectors';
import { getWorkspaceRecordPatch } from '../../../workspaceRecordPatch';

type Node = WorkspaceSnapshot['nodesById'][string];
const annotationIndexes = new WeakMap<WorkspaceSnapshot['nodesById'], Map<string, string[]>>();

export function companionArticleChildIds(nodes: WorkspaceSnapshot['nodesById'], parentId: string) {
  let index = annotationIndexes.get(nodes);
  const patch = getWorkspaceRecordPatch(nodes);
  if (!index && patch && patch.changedIds.every(id => patch.previous[id]?.parentNodeId === nodes[id]?.parentNodeId)) {
    index = annotationIndexes.get(patch.previous);
    if (index) annotationIndexes.set(nodes, index);
  }
  if (!index) {
    index = new Map();
    // Unknown catalog changes rebuild relations; learning patches preserve them.
    for (const node of Object.values(nodes)) {
      if (!node.parentNodeId) continue;
      const children = index.get(node.parentNodeId) ?? [];
      children.push(node.id);
      index.set(node.parentNodeId, children);
    }
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
  const annotations = companionArticleChildIds(snapshot.nodesById, nodeId)
    .filter(id => snapshot.nodesById[id]?.anchorLink)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => [contentFacts(snapshot.nodesById[id]!), isCanonicalTrashedNodeId(snapshot, id)]);
  return JSON.stringify([snapshot.libraryScope, visible, trashed, contentFacts(snapshot.nodesById[nodeId]), annotations]);
}

export class CompanionReadingSnapshotChanged extends Error {
  constructor() { super('The article changed while loading. Refresh the current workspace.'); }
}
