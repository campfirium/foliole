import type { NativeNodeSnapshotArgs } from '../../lib/platform/nativeContract';
import type { Node } from '../features/nodes/model/nodeTypes';

import { stagePendingNodeSync } from './workspacePendingNodeSync';
import { isNodeDocumentLoaded } from './workspaceRendererBoundary';
import { syncTextAnchorLocatorsForParentContent } from './workspaceTextAnchorLocatorSync';

function toNativeNodeSnapshotArgs(node: Node, position: number | null): NativeNodeSnapshotArgs {
  return {
    nodeId: node.id,
    parentNodeId: node.parentNodeId,
    kind: node.kind,
    priority: node.priority ?? null,
    desiredRetention: node.desiredRetention ?? null,
    title: node.title,
    isTitleManual: Boolean(node.isTitleManual),
    hideTitleHeading: Boolean(node.hideTitleHeading),
    content: node.content,
    virtualFilter: node.virtualFilter ?? null,
    reveal: node.reveal,
    anchorLink: node.anchorLink ?? null,
    imageRegions: node.imageRegions ?? null,
    reading: node.reading ?? null,
    position,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt
  };
}

function stageHydratedTextAnchorChildrenForReplay(nodes: Node[], nodeOrder: unknown) {
  if (nodes.length === 0 || !Array.isArray(nodeOrder)) {
    return;
  }
  nodes.filter((node) => isNodeDocumentLoaded(node)).forEach((node) => {
    const position = nodeOrder.indexOf(node.id);
    stagePendingNodeSync(toNativeNodeSnapshotArgs(node, position >= 0 ? position : null));
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
