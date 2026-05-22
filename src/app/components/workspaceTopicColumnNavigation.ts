import { HOME_NODE_ID, isHomeNode } from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNode, WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

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

function collectHomeTopicColumnNodeIds(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById,
  trashedNodeIds: readonly string[]
) {
  return nodeOrder.filter((nodeId) => {
    if (!isVisibleTopicNode(nodesById[nodeId], trashedNodeIds)) {
      return false;
    }
    const parentId = nodesById[nodeId]?.parentNodeId ?? null;
    const parentNode = parentId ? nodesById[parentId] : null;
    return !parentNode || parentNode.kind === 'folder';
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

  if (folderNodeId === HOME_NODE_ID || isHomeNode(nodesById[folderNodeId])) {
    return collectHomeTopicColumnNodeIds(nodeOrder, nodesById, trashedNodeIds);
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
    if (!currentNodeId || topicNodeIdSet.has(currentNodeId)) {
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
