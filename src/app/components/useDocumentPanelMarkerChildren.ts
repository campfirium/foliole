import { useRef } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { readWorkspaceRecordPatch } from '../../shared/workspaceRecordPatch';

interface MarkerChildrenCache {
  nodeId: string | null;
  nodesById: Record<string, Node>;
  children: Record<string, Node>;
}

function hasSameChildAnchor(previous: Node | undefined, next: Node | undefined, nodeId: string | null) {
  // Consumers read only child identity, parent linkage and anchor facts; scheduling is irrelevant.
  const wasChild = Boolean(previous && previous.parentNodeId === nodeId);
  const isChild = Boolean(next && next.parentNodeId === nodeId);
  return wasChild === isChild && (!isChild || previous?.anchorLink === next?.anchorLink);
}

// Patch metadata proves that unrelated updates cannot change this document's markers.
// Complete record replacements are recomputed because they carry no such proof.
export function useDocumentPanelMarkerChildren(nodeId: string | null, nodesById: Record<string, Node>) {
  const cacheRef = useRef<MarkerChildrenCache | null>(null);
  const cached = cacheRef.current;
  if (cached?.nodeId === nodeId) {
    const changedIds = readWorkspaceRecordPatch(nodesById, cached.nodesById);
    if (nodesById === cached.nodesById || changedIds?.every((id) =>
      hasSameChildAnchor(cached.nodesById[id], nodesById[id], nodeId))) {
      cacheRef.current = { ...cached, nodesById };
      return cached.children;
    }
  }
  const children = nodeId === null ? {} : Object.fromEntries(
    Object.values(nodesById).filter((node) => node.parentNodeId === nodeId).map((node) => [node.id, node])
  );
  cacheRef.current = { nodeId, nodesById, children };
  return children;
}
