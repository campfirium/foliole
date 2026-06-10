import {
  HOME_NODE_ID,
  INBOX_NODE_ID,
  TRASH_NODE_ID,
  isHomeNode,
  isInboxNode,
  isTrashNode,
  isVirtualNode,
  isVirtualRootNode
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { isCanonicalVisibleNodeId } from '../../shared/workspaceCanonicalSelectors';

export { collectTopicColumnNodeIds } from './workspaceTopicColumnNavigation';

function createNavigationTrashNode(): WorkspaceListNode {
  const timestamp = new Date().toISOString();
  return {
    createdAt: timestamp,
    hasContent: false,
    hasReveal: false,
    id: TRASH_NODE_ID,
    kind: 'folder',
    parentNodeId: null,
    reading: null,
    review: null,
    specialKind: 'trash',
    title: 'Trash',
    updatedAt: timestamp
  };
}

function isVisibleFolderNode(
  node: WorkspaceListNode | undefined,
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  if (!node || !isCanonicalVisibleNodeId({ nodeOrder: [], nodesById, trashedNodeIds }, node.id)) {
    return false;
  }
  return node.kind === 'folder' && !isVirtualRootNode(node) && !isVirtualNode(node);
}

function resolveNavigationFolderParentId(
  node: WorkspaceListNode,
  folderNodeIds: ReadonlySet<string>,
  hasHome: boolean
) {
  if (!hasHome || isHomeNode(node) || isTrashNode(node)) {
    return node.parentNodeId ?? null;
  }
  if (isInboxNode(node)) {
    return HOME_NODE_ID;
  }
  const parentId = node.parentNodeId ?? null;
  return parentId && folderNodeIds.has(parentId) ? parentId : HOME_NODE_ID;
}

export function buildFolderNavigationNodeOrder(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const visibleFolderIds = nodeOrder.filter((nodeId) => isVisibleFolderNode(nodesById[nodeId], nodesById, trashedNodeIds));
  const regularFolderIds = visibleFolderIds.filter((nodeId) => {
    const node = nodesById[nodeId];
    return (
      nodeId !== HOME_NODE_ID &&
      nodeId !== INBOX_NODE_ID &&
      nodeId !== TRASH_NODE_ID &&
      !isHomeNode(node) &&
      !isInboxNode(node) &&
      !isTrashNode(node)
    );
  });

  return [
    ...(isVisibleFolderNode(nodesById[HOME_NODE_ID], nodesById, trashedNodeIds) ? [HOME_NODE_ID] : []),
    ...(isVisibleFolderNode(nodesById[INBOX_NODE_ID], nodesById, trashedNodeIds) ? [INBOX_NODE_ID] : []),
    ...regularFolderIds,
    TRASH_NODE_ID
  ];
}

export function buildFolderNavigationNodesByIdFromOrder(
  folderNodeOrder: string[],
  nodesById: WorkspaceListNodesById
) {
  const hasHome = folderNodeOrder.includes(HOME_NODE_ID);
  const folderNodeIds = new Set(folderNodeOrder);
  const folderEntries: Array<[string, WorkspaceListNode | undefined]> = folderNodeOrder.map((nodeId) => {
    const node = nodeId === TRASH_NODE_ID ? createNavigationTrashNode() : nodesById[nodeId];
    if (!node || nodeId === TRASH_NODE_ID) {
      return [nodeId, node];
    }
    return [nodeId, { ...node, parentNodeId: resolveNavigationFolderParentId(node, folderNodeIds, hasHome) }];
  });
  return Object.fromEntries(
    folderEntries.filter((entry): entry is [string, WorkspaceListNode] => Boolean(entry[1]))
  );
}

export function buildFolderNavigationNodesById(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  return buildFolderNavigationNodesByIdFromOrder(
    buildFolderNavigationNodeOrder(nodeOrder, nodesById, trashedNodeIds),
    nodesById
  );
}

function resolveActiveFolderNodeId(
  activeNodeId: string | null,
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  let currentNodeId = activeNodeId;

  while (currentNodeId) {
    const node = nodesById[currentNodeId];
    if (isVisibleFolderNode(node, nodesById, trashedNodeIds)) {
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

  if (isVisibleFolderNode(nodesById[HOME_NODE_ID], nodesById, trashedNodeIds)) {
    return HOME_NODE_ID;
  }

  return buildFolderNavigationNodeOrder(nodeOrder, nodesById, trashedNodeIds)[0] ?? null;
}

export function resolveActiveFolderColumnNodeId(
  activeNodeId: string | null,
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  if (!activeNodeId) {
    return null;
  }

  const activeNode = nodesById[activeNodeId];
  if (!activeNode || !isCanonicalVisibleNodeId({ nodeOrder, nodesById, trashedNodeIds }, activeNodeId)) {
    return null;
  }

  if (isVisibleFolderNode(activeNode, nodesById, trashedNodeIds)) {
    return activeNodeId;
  }

  const activeFolderNodeId = resolveActiveFolderNodeId(activeNodeId, nodesById, trashedNodeIds);
  if (activeFolderNodeId) {
    return activeFolderNodeId;
  }

  return activeNode.parentNodeId ?? null;
}

export function buildTopicNavigationNodesById(
  topicNodeIds: string[],
  nodesById: WorkspaceListNodesById
) {
  return Object.fromEntries(
    topicNodeIds
      .map((nodeId) => [nodeId, nodesById[nodeId]] as const)
      .filter((entry): entry is readonly [string, WorkspaceListNode] => Boolean(entry[1]))
  );
}
