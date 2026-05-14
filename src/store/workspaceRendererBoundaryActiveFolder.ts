import type { Node } from '../features/nodes/model/nodeTypes';

function listActiveFolderChildNodeIds(activeNodeId: string | null, nodesById: Record<string, Node>) {
  if (!activeNodeId) {
    return [];
  }
  const activeNode = nodesById[activeNodeId];
  if (!activeNode || activeNode.kind !== 'folder' || activeNode.specialKind === 'inbox') {
    return [];
  }
  return Object.values(nodesById)
    .filter((node) => node.parentNodeId === activeNodeId)
    .map((node) => node.id);
}

export function collectActiveFolderRendererBoundaryKeepNodeIds(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  keepNodeIds: ReadonlySet<string>
) {
  const nextKeepNodeIds = new Set(keepNodeIds);
  for (const nodeId of listActiveFolderChildNodeIds(activeNodeId, nodesById)) {
    nextKeepNodeIds.add(nodeId);
  }
  return nextKeepNodeIds;
}
