import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

function isVisibleFolderNode(
  node: WorkspaceListNode | undefined,
  trashedNodeIds: readonly string[]
) {
  if (!node || trashedNodeIds.includes(node.id)) {
    return false;
  }
  return node.kind === 'folder';
}

export function buildFolderNavigationNodeOrder(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  return nodeOrder.filter((nodeId) => isVisibleFolderNode(nodesById[nodeId], trashedNodeIds));
}

export function buildFolderNavigationNodesById(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const visibleFolderIds = new Set(buildFolderNavigationNodeOrder(nodeOrder, nodesById, trashedNodeIds));
  return Object.fromEntries(
    Object.entries(nodesById).map(([nodeId, node]) => [nodeId, visibleFolderIds.has(nodeId) ? node : undefined])
  );
}

export function resolveActiveFolderNodeId(
  activeNodeId: string | null,
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  let currentNodeId = activeNodeId;

  while (currentNodeId) {
    const node = nodesById[currentNodeId];
    if (isVisibleFolderNode(node, trashedNodeIds)) {
      return currentNodeId;
    }
    currentNodeId = node?.parentNodeId ?? null;
  }

  return null;
}

export function resolveFocusedFolderNodeId(
  activeNodeId: string | null,
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const activeFolderNodeId = resolveActiveFolderNodeId(activeNodeId, nodesById, trashedNodeIds);
  if (activeFolderNodeId) {
    return activeFolderNodeId;
  }

  if (isVisibleFolderNode(nodesById[INBOX_NODE_ID], trashedNodeIds)) {
    return INBOX_NODE_ID;
  }

  return buildFolderNavigationNodeOrder(nodeOrder, nodesById, trashedNodeIds)[0] ?? null;
}

export function resolveActiveFolderColumnNodeId(
  activeNodeId: string | null,
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const activeFolderNodeId = resolveActiveFolderNodeId(activeNodeId, nodesById, trashedNodeIds);
  if (activeFolderNodeId) {
    return activeFolderNodeId;
  }

  if (!activeNodeId) {
    return null;
  }

  const activeNode = nodesById[activeNodeId];
  if (!activeNode || trashedNodeIds.includes(activeNodeId)) {
    return null;
  }

  const hasVisibleChildren = nodeOrder.some(
    (nodeId) => !trashedNodeIds.includes(nodeId) && nodesById[nodeId]?.parentNodeId === activeNodeId
  );
  if (hasVisibleChildren) {
    return activeNodeId;
  }

  return activeNode.parentNodeId ?? null;
}

export function collectFolderColumnNodeIds(
  folderNodeId: string | null,
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  return nodeOrder.filter((nodeId) => {
    if (trashedNodeIds.includes(nodeId)) {
      return false;
    }
    return (nodesById[nodeId]?.parentNodeId ?? null) === folderNodeId;
  });
}
