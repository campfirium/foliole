import type { Node } from '../features/nodes/model/nodeTypes';
import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeRepository';

import { stagePendingNodeSync } from './workspacePendingNodeSync';
import { isNodeDocumentLoaded } from './workspaceRendererBoundary';
import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

function stageHydratedTextAnchorChildrenForReplay(nodes: Node[], nodeOrder: unknown) {
  if (nodes.length === 0 || !Array.isArray(nodeOrder)) {
    return;
  }
  nodes.filter((node) => isNodeDocumentLoaded(node)).forEach((node) => {
    const position = nodeOrder.indexOf(node.id);
    stagePendingNodeSync(createWorkspaceRuntimeNodeSnapshot(node, position >= 0 ? position : null));
  });
}

export function syncHydratedTextAnchorChildrenForActiveNode(args: {
  activeNode: Node;
  nodeOrder: unknown;
  nodesById: Record<string, Node>;
  timestamp: string;
}) {
  const syncedTextAnchorChildren = syncTextAnchorLocatorsForParentContent({
    nextContent: args.activeNode.content,
    nodesById: args.nodesById,
    parentNodeId: args.activeNode.id,
    timestamp: args.timestamp
  });
  stageHydratedTextAnchorChildrenForReplay(syncedTextAnchorChildren.updatedNodes, args.nodeOrder);
  return syncedTextAnchorChildren.nextNodesById;
}
