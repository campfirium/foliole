import {
  remapTextAnchorLocator
} from '../features/editor/model/textAnchorLocatorResolution';
import {
  getTextAnchorLocators,
  type Node,
  type TextAnchorLocator
} from '../features/nodes/model/nodeTypes';

function createLocatorValue(locators: TextAnchorLocator[]) {
  return locators.length === 1 ? locators[0] : { ranges: locators };
}

function areLocatorsEqual(left: TextAnchorLocator[], right: TextAnchorLocator[]) {
  return left.length === right.length && left.every((locator, index) => {
    const other = right[index];
    return Boolean(
      other &&
        locator.from === other.from &&
        locator.to === other.to &&
        locator.originalText === other.originalText
    );
  });
}

function shouldSyncTextAnchorNode(node: Node, parentNodeId: string) {
  return node.parentNodeId === parentNodeId && getTextAnchorLocators(node.anchorLink?.locator).length > 0;
}

function buildNextTextAnchorNode(args: {
  nextContent: string;
  node: Node;
  previousContent?: string;
  timestamp: string;
}) {
  if (!args.node.anchorLink) {
    return null;
  }
  const currentLocators = getTextAnchorLocators(args.node.anchorLink.locator);
  if (currentLocators.length === 0) {
    return null;
  }
  const nextLocators = currentLocators.map((locator) => remapTextAnchorLocator(args.nextContent, locator, args.previousContent));
  if (areLocatorsEqual(currentLocators, nextLocators)) {
    return null;
  }
  return {
    ...args.node,
    anchorLink: {
      ...args.node.anchorLink,
      locator: createLocatorValue(nextLocators)
    },
    updatedAt: args.timestamp
  } satisfies Node;
}

export function syncTextAnchorLocatorsForParentContent(args: {
  nextContent: string;
  nodesById: Record<string, Node>;
  parentNodeId: string;
  previousContent?: string;
  timestamp: string;
}) {
  const updatedNodes: Node[] = [];
  let nextNodesById = args.nodesById;

  Object.values(args.nodesById).forEach((node) => {
    if (!shouldSyncTextAnchorNode(node, args.parentNodeId)) {
      return;
    }
    const nextNode = buildNextTextAnchorNode({
      nextContent: args.nextContent,
      node,
      previousContent: args.previousContent,
      timestamp: args.timestamp
    });
    if (!nextNode) {
      return;
    }
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
