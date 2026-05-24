import { sortFolderListNodes } from '../features/nodes/model/folderListOrdering';
import { hasNodeContent, type Node } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';

import type { WorkspaceState } from './workspaceStore';

export function collectFolderSequentialTopicIds(args: {
  nodesById: WorkspaceState['nodesById'];
  sourceNodeId: string;
}) {
  const sourceNode = args.nodesById[args.sourceNodeId];
  if (!sourceNode) {
    return [];
  }
  return sortFolderListNodes(
    Object.values(args.nodesById).filter((node): node is Node =>
      Boolean(
        node &&
          node.parentNodeId === args.sourceNodeId &&
          node.kind === 'topic' &&
          hasNodeContent(node) &&
          isReadingReviewItemNode(node)
      )
    ),
    'manual',
    'asc',
    {},
    sourceNode.manualChildOrder
  ).map((node) => node.id);
}
