import {
  INBOX_NODE_ID,
  TRASH_NODE_ID,
  isInboxNode,
  isTrashNode,
  isVirtualNode,
  isVirtualRootNode
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { compareNaturalName } from './workspaceContentSort';

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
  trashedNodeIds: readonly string[]
) {
  if (!node || trashedNodeIds.includes(node.id)) {
    return false;
  }
  return node.kind === 'folder' && !isVirtualRootNode(node) && !isVirtualNode(node);
}

function isVisibleTopicNode(
  node: WorkspaceListNode | undefined,
  trashedNodeIds: readonly string[]
) {
  if (!node || trashedNodeIds.includes(node.id)) {
    return false;
  }
  return node.kind !== 'folder';
}

function buildVisibleChildMap(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const visibleChildrenByParent = new Map<string | null, string[]>();

  for (const nodeId of nodeOrder) {
    if (trashedNodeIds.includes(nodeId)) {
      continue;
    }
    const node = nodesById[nodeId];
    if (!node) {
      continue;
    }

    const parentId = node.parentNodeId ?? null;
    const siblings = visibleChildrenByParent.get(parentId);
    if (siblings) {
      siblings.push(nodeId);
      continue;
    }
    visibleChildrenByParent.set(parentId, [nodeId]);
  }

  return visibleChildrenByParent;
}

export function buildFolderNavigationNodeOrder(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const visibleFolderIds = nodeOrder.filter((nodeId) => isVisibleFolderNode(nodesById[nodeId], trashedNodeIds));
  const regularFolderIds = visibleFolderIds.filter((nodeId) => {
    const node = nodesById[nodeId];
    return nodeId !== INBOX_NODE_ID && nodeId !== TRASH_NODE_ID && !isInboxNode(node) && !isTrashNode(node);
  }).sort((leftId, rightId) => compareNaturalName(nodesById[leftId]?.title ?? '', nodesById[rightId]?.title ?? ''));

  return [
    ...(isVisibleFolderNode(nodesById[INBOX_NODE_ID], trashedNodeIds) ? [INBOX_NODE_ID] : []),
    ...regularFolderIds,
    TRASH_NODE_ID
  ];
}

export function buildFolderNavigationNodesById(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  const visibleFolderIds = new Set(buildFolderNavigationNodeOrder(nodeOrder, nodesById, trashedNodeIds));
  const folderEntries: Array<[string, WorkspaceListNode | undefined]> = [
    ...Object.entries(nodesById),
    [TRASH_NODE_ID, createNavigationTrashNode()]
  ];
  return Object.fromEntries(
    folderEntries.map(([nodeId, node]) => [
      nodeId,
      visibleFolderIds.has(nodeId) ? node : undefined
    ])
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

export function collectTopicColumnNodeIds(
  folderNodeId: string | null,
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  if (!folderNodeId) {
    return [];
  }

  const visibleChildrenByParent = buildVisibleChildMap(nodeOrder, nodesById, trashedNodeIds);
  const topicNodeIds: string[] = [];
  const topicNodeIdSet = new Set<string>();
  const directTopicRootIds = (visibleChildrenByParent.get(folderNodeId) ?? []).filter((nodeId) =>
    isVisibleTopicNode(nodesById[nodeId], trashedNodeIds)
  );
  const queue = [...directTopicRootIds];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const currentNodeId = queue[queueIndex];
    queueIndex += 1;

    if (topicNodeIdSet.has(currentNodeId)) {
      continue;
    }

    topicNodeIdSet.add(currentNodeId);
    topicNodeIds.push(currentNodeId);
    const childIds = (visibleChildrenByParent.get(currentNodeId) ?? []).filter((nodeId) =>
      isVisibleTopicNode(nodesById[nodeId], trashedNodeIds)
    );
    queue.push(...childIds);
  }

  return nodeOrder.filter((nodeId) => topicNodeIdSet.has(nodeId));
}

export function buildTopicNavigationNodesById(
  topicNodeIds: string[],
  nodesById: WorkspaceListNodesById
) {
  const visibleTopicIds = new Set(topicNodeIds);
  return Object.fromEntries(
    Object.entries(nodesById).map(([nodeId, node]) => [nodeId, visibleTopicIds.has(nodeId) ? node : undefined])
  );
}
