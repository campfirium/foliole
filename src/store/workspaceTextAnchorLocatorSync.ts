import {
  deriveMarkdownImageTextAnchorRegions,
  expandMarkdownImageTextLocator
} from '../../lib/core/anchors/markdownImageTextAnchor';
import {
  remapTextAnchorLocator
} from '../features/editor/model/textAnchorLocatorResolution';
import {
  getTextAnchorLocators,
  type Node,
  type TextAnchorLocator
} from '../features/nodes/model/nodeTypes';

import {
  readEditorInputDiagnosticTime
} from './workspaceEditorInputDiagnostics';
import {
  createTextAnchorLocatorSyncDiagnosticStats,
  finishTextAnchorLocatorSyncDiagnostics,
  type TextAnchorLocatorSyncDiagnosticStats
} from './workspaceTextAnchorLocatorSyncDiagnostics';

type TextAnchorLocatorSyncState = {
  nextNodesById: Record<string, Node>;
  originalNodesById: Record<string, Node>;
  updatedNodes: Node[];
};

function createLocatorValue(locators: TextAnchorLocator[]) {
  const [locator] = locators;
  return locators.length === 1 && locator ? locator : { ranges: locators };
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

function areImageRegionsEqual(left: Node['imageRegions'], right: Node['imageRegions']) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function shouldSyncTextAnchorNode(
  node: Node,
  parentNodeId: string,
  excludedNodeIds?: ReadonlySet<string>
) {
  return !excludedNodeIds?.has(node.id) &&
    node.parentNodeId === parentNodeId &&
    getTextAnchorLocators(node.anchorLink?.locator).length > 0;
}

function buildNextTextAnchorNode(args: {
  diagnostics?: TextAnchorLocatorSyncDiagnosticStats;
  nextContent: string;
  node: Node;
  previousContent?: string;
  timestamp: string;
}) {
  const buildStartedAt = args.diagnostics ? readEditorInputDiagnosticTime() : 0;
  if (!args.node.anchorLink) {
    return null;
  }
  const currentLocators = getTextAnchorLocators(args.node.anchorLink.locator);
  if (currentLocators.length === 0) {
    return null;
  }
  const nextLocators = currentLocators.map((locator) => {
    const remapStartedAt = args.diagnostics ? readEditorInputDiagnosticTime() : 0;
    const remappedLocator = remapTextAnchorLocator(args.nextContent, locator, args.previousContent);
    if (args.diagnostics) {
      args.diagnostics.remapMs += readEditorInputDiagnosticTime() - remapStartedAt;
    }
    return expandMarkdownImageTextLocator(
      args.nextContent,
      remappedLocator,
      locator
    );
  });
  const imageRegionStartedAt = args.diagnostics ? readEditorInputDiagnosticTime() : 0;
  const nextImageRegions = args.node.anchorLink.kind === 'image-excerpt'
    ? args.node.imageRegions ?? null
    : deriveMarkdownImageTextAnchorRegions({
        anchorId: args.node.anchorLink.id,
        content: args.nextContent,
        locators: nextLocators
      });
  if (args.diagnostics) {
    args.diagnostics.imageRegionMs += readEditorInputDiagnosticTime() - imageRegionStartedAt;
    args.diagnostics.buildMs += readEditorInputDiagnosticTime() - buildStartedAt;
  }
  if (areLocatorsEqual(currentLocators, nextLocators) && areImageRegionsEqual(args.node.imageRegions, nextImageRegions)) {
    return null;
  }
  return {
    ...args.node,
    anchorLink: {
      ...args.node.anchorLink,
      locator: createLocatorValue(nextLocators)
    },
    imageRegions: nextImageRegions,
    updatedAt: args.timestamp
  } satisfies Node;
}

function readTextAnchorLocatorSyncNodes(args: {
  diagnostics: TextAnchorLocatorSyncDiagnosticStats | null;
  nodesById: Record<string, Node>;
}) {
  const objectValuesStartedAt = args.diagnostics ? readEditorInputDiagnosticTime() : 0;
  const nodes = Object.values(args.nodesById);
  if (args.diagnostics) {
    args.diagnostics.objectValuesMs = readEditorInputDiagnosticTime() - objectValuesStartedAt;
    args.diagnostics.scannedNodes = nodes.length;
  }
  return nodes;
}

function syncTextAnchorLocatorNode(args: {
  diagnostics: TextAnchorLocatorSyncDiagnosticStats | null;
  excludedNodeIds?: ReadonlySet<string>;
  nextContent: string;
  node: Node;
  parentNodeId: string;
  previousContent?: string;
  state: TextAnchorLocatorSyncState;
  timestamp: string;
}) {
  if (!shouldSyncTextAnchorNode(args.node, args.parentNodeId, args.excludedNodeIds)) {
    return;
  }
  if (args.diagnostics) {
    args.diagnostics.candidateNodes += 1;
  }
  const nextNode = buildNextTextAnchorNode({
    ...(args.diagnostics ? { diagnostics: args.diagnostics } : {}),
    nextContent: args.nextContent,
    node: args.node,
    ...(args.previousContent !== undefined ? { previousContent: args.previousContent } : {}),
    timestamp: args.timestamp
  });
  if (!nextNode) {
    return;
  }
  if (args.state.nextNodesById === args.state.originalNodesById) {
    args.state.nextNodesById = { ...args.state.originalNodesById };
  }
  args.state.nextNodesById[nextNode.id] = nextNode;
  args.state.updatedNodes.push(nextNode);
  if (args.diagnostics) {
    args.diagnostics.updatedNodes += 1;
  }
}

export function syncTextAnchorLocatorsForParentContent(args: {
  excludedNodeIds?: ReadonlySet<string>;
  nextContent: string;
  nodesById: Record<string, Node>;
  parentNodeId: string;
  previousContent?: string;
  timestamp: string;
}) {
  const diagnostics = createTextAnchorLocatorSyncDiagnosticStats();
  const syncState: TextAnchorLocatorSyncState = {
    nextNodesById: args.nodesById,
    originalNodesById: args.nodesById,
    updatedNodes: []
  };
  readTextAnchorLocatorSyncNodes({ diagnostics, nodesById: args.nodesById }).forEach((node) => {
    syncTextAnchorLocatorNode({
      diagnostics,
      ...(args.excludedNodeIds ? { excludedNodeIds: args.excludedNodeIds } : {}),
      nextContent: args.nextContent,
      node,
      parentNodeId: args.parentNodeId,
      ...(args.previousContent !== undefined ? { previousContent: args.previousContent } : {}),
      state: syncState,
      timestamp: args.timestamp
    });
  });
  const syncDiagnostics = finishTextAnchorLocatorSyncDiagnostics(diagnostics);

  return {
    ...(syncDiagnostics ? { diagnostics: syncDiagnostics } : {}),
    nextNodesById: syncState.nextNodesById,
    updatedNodes: syncState.updatedNodes
  };
}
