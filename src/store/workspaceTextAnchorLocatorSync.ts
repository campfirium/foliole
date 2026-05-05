import { remapTextAnchorLocator } from '../features/editor/model/textAnchorLocatorResolution';
import { isTextAnchorLocator, type Node } from '../features/nodes/model/nodeTypes';

export function syncTextAnchorLocatorsForParentContent(args: {
  nextContent: string;
  nodesById: Record<string, Node>;
  parentNodeId: string;
  timestamp: string;
}) {
  const updatedNodes: Node[] = [];
  let nextNodesById = args.nodesById;

  Object.values(args.nodesById).forEach((node) => {
    if (node.parentNodeId !== args.parentNodeId || !node.anchorLink || !isTextAnchorLocator(node.anchorLink.locator)) {
      return;
    }

    const nextLocator = remapTextAnchorLocator(args.nextContent, node.anchorLink.locator);
    if (
      nextLocator.from === node.anchorLink.locator.from &&
      nextLocator.to === node.anchorLink.locator.to &&
      nextLocator.originalText === node.anchorLink.locator.originalText
    ) {
      return;
    }

    const nextNode: Node = {
      ...node,
      anchorLink: {
        ...node.anchorLink,
        locator: nextLocator
      },
      updatedAt: args.timestamp
    };
    if (nextNodesById === args.nodesById) {
      nextNodesById = { ...args.nodesById };
    }
    nextNodesById[nextNode.id] = nextNode;
    updatedNodes.push(nextNode);
  });

  return {
    nextNodesById,
    updatedNodes
  };
}
