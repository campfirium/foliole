import type { WorkspaceSnapshot } from '../../../../../lib/core/database/workspaceSnapshot';
import { isCanonicalTrashedNodeId, isCanonicalVisibleNodeId } from '../../../workspaceCanonicalSelectors';

type Node = WorkspaceSnapshot['nodesById'][string];

function contentFacts(node: Node) {
  return [node.id, node.currentVersionId, node.bodyBlobHash, node.bodyStatus, node.content,
    node.reveal, node.title, node.hideTitleHeading, node.anchorLink, node.parentNodeId,
    node.deletedAt, node.attachments, node.imageRegions, node.imageSources];
}

export function companionReadingDemandKey(snapshot: WorkspaceSnapshot | null, nodeId: string | null) {
  if (!snapshot || !nodeId || !snapshot.nodesById[nodeId]) return null;
  const visible = isCanonicalVisibleNodeId(snapshot, nodeId);
  const trashed = isCanonicalTrashedNodeId(snapshot, nodeId);
  if (!visible && !trashed) return null;
  const annotations = Object.values(snapshot.nodesById)
    .filter((node) => node.parentNodeId === nodeId && node.anchorLink)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((node) => [contentFacts(node), isCanonicalTrashedNodeId(snapshot, node.id)]);
  return JSON.stringify([snapshot.libraryScope, visible, trashed, contentFacts(snapshot.nodesById[nodeId]), annotations]);
}

export class CompanionReadingSnapshotChanged extends Error {
  constructor() { super('The article changed while loading. Refresh the current workspace.'); }
}
