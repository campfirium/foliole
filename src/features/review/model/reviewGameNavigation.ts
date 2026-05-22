import type { Node } from '../../nodes/model/nodeTypes';

interface ReviewGameNavigationSource {
  nodeOrder: string[];
  nodesById: Record<string, Node | undefined>;
  trashedNodeIds: string[];
}

function isAvailableReviewNode(nodeId: string, source: ReviewGameNavigationSource) {
  const node = source.nodesById[nodeId];
  return Boolean(node && !node.specialKind && !source.trashedNodeIds.includes(nodeId));
}

export function resolveReviewFirstChildNodeId(parentNodeId: string, source: ReviewGameNavigationSource) {
  return source.nodeOrder.find((nodeId) => {
    const node = source.nodesById[nodeId];
    return node?.parentNodeId === parentNodeId && isAvailableReviewNode(nodeId, source);
  }) ?? null;
}

export function resolveReviewSiblingNodeId(
  currentNodeId: string,
  direction: -1 | 1,
  source: ReviewGameNavigationSource
) {
  const currentNode = source.nodesById[currentNodeId];
  if (!currentNode || !isAvailableReviewNode(currentNodeId, source)) {
    return null;
  }
  const siblings = source.nodeOrder.filter((nodeId) => {
    const node = source.nodesById[nodeId];
    return node?.parentNodeId === currentNode.parentNodeId && isAvailableReviewNode(nodeId, source);
  });
  const currentIndex = siblings.indexOf(currentNodeId);
  if (currentIndex < 0) {
    return null;
  }
  return siblings[currentIndex + direction] ?? null;
}

export function resolveReviewSourceTopicNodeId(
  currentNodeId: string,
  source: Pick<ReviewGameNavigationSource, 'nodesById' | 'trashedNodeIds'>
) {
  let cursorId: string | null = currentNodeId;
  const seenNodeIds = new Set<string>();

  while (cursorId) {
    if (seenNodeIds.has(cursorId) || source.trashedNodeIds.includes(cursorId)) {
      return null;
    }
    seenNodeIds.add(cursorId);
    const node: Node | undefined = source.nodesById[cursorId];
    if (!node || node.specialKind) {
      return null;
    }
    if (node.kind === 'topic' && !node.anchorLink) {
      return cursorId;
    }
    cursorId = node.parentNodeId;
  }

  return null;
}

export function isReviewNodeAvailable(
  nodeId: string | null,
  source: Pick<ReviewGameNavigationSource, 'nodesById' | 'trashedNodeIds'>
) {
  return Boolean(nodeId && source.nodesById[nodeId] && !source.nodesById[nodeId]?.specialKind && !source.trashedNodeIds.includes(nodeId));
}
