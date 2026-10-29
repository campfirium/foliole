import { sortManualFolderNodes } from '../nodes/manualFolderOrder.js';
import { hasNodeContent } from '../nodes/nodeContentFlags.js';

import { isReadingReviewItemNode } from './reviewItemKind.js';
import { isSequentialReadingSourceFolder } from './sequentialReadingSources.js';
import type { SequentialReadingStateNode as Node, SequentialReadingStateNodes as SequentialReadingNodes } from './sequentialReadingState.js';



export function collectFolderSequentialTopicIds(args: {
  nodesById: SequentialReadingNodes;
  sourceNodeId: string;
}) {
  const sourceNode = args.nodesById[args.sourceNodeId];
  if (!sourceNode) {
    return [];
  }
  return sortManualFolderNodes(
    Object.values(args.nodesById).filter((node): node is Node =>
      Boolean(
        node &&
          node.parentNodeId === args.sourceNodeId &&
          node.kind === 'topic' &&
          hasNodeContent(node) &&
          isReadingReviewItemNode(node)
      )
    ),
    sourceNode.manualChildOrder
  ).map((node) => node.id);
}

function isDescendantOfSource(
  nodeId: string,
  sourceNodeId: string,
  nodesById: SequentialReadingNodes
) {
  const visited = new Set<string>();
  let current = nodesById[nodeId];
  while (current?.parentNodeId && !visited.has(current.parentNodeId)) {
    if (current.parentNodeId === sourceNodeId) {
      return true;
    }
    visited.add(current.parentNodeId);
    current = nodesById[current.parentNodeId];
  }
  return false;
}

export function collectSequentialDerivedTopicIds(args: {
  nodeOrder: string[];
  nodesById: SequentialReadingNodes;
  sourceNodeId: string;
}) {
  const sourceNode = args.nodesById[args.sourceNodeId];
  if (isSequentialReadingSourceFolder(sourceNode)) {
    return collectFolderSequentialTopicIds({
      nodesById: args.nodesById,
      sourceNodeId: args.sourceNodeId
    });
  }
  return args.nodeOrder.filter((nodeId) => {
    const node = args.nodesById[nodeId];
    return Boolean(
      node &&
        nodeId !== args.sourceNodeId &&
        node.kind === 'topic' &&
        hasNodeContent(node) &&
        isReadingReviewItemNode(node) &&
        isDescendantOfSource(nodeId, args.sourceNodeId, args.nodesById)
    );
  });
}
