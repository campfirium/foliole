import { sortManualFolderNodes } from '../nodes/manualFolderOrder.js';
import { hasNodeContent } from '../nodes/nodeContentFlags.js';

import { isReadingReviewItemNode } from './reviewItemKind.js';
import type { SequentialReadingNode as Node, SequentialReadingNodes } from './sequentialReadingTypes.js';



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
