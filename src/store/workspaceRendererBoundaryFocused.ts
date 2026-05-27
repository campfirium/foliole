import type { Node } from '../features/nodes/model/nodeTypes';

import { hasMatchingBoundaryPreservedFields } from './workspaceSnapshotFieldManifest';

interface FocusedRendererBoundaryArgs {
  activeNodeId: string | null;
  currentKeepNodeIds: ReadonlySet<string>;
  currentNodesById: Record<string, Node>;
  documentWorksetNodeIds: string[];
  isBoundaryProjectionReusable: (currentNode: Node | undefined, sourceNode: Node, keepDocument: boolean) => boolean;
  keepNodeIds: ReadonlySet<string>;
  nextNodesById: Record<string, Node>;
  shouldKeepNodeDocument: (nodeId: string, activeNodeId: string | null, keepNodeIds: ReadonlySet<string>) => boolean;
  toRendererBoundaryNode: (node: Node, keepDocument: boolean) => Node;
}

function listActiveFolderChildNodeIds(activeNodeId: string | null, nodesById: Record<string, Node>) {
  if (!activeNodeId) {
    return [];
  }
  const activeNode = nodesById[activeNodeId];
  if (!activeNode || activeNode.kind !== 'folder' || activeNode.specialKind === 'inbox') {
    return [];
  }
  return Object.values(nodesById)
    .filter((node) => node.parentNodeId === activeNodeId)
    .map((node) => node.id);
}

function collectBoundaryKeepNodeIds(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  keepNodeIds: ReadonlySet<string>
) {
  const nextKeepNodeIds = new Set(keepNodeIds);
  for (const nodeId of listActiveFolderChildNodeIds(activeNodeId, nodesById)) {
    nextKeepNodeIds.add(nodeId);
  }
  return nextKeepNodeIds;
}

export function hasMatchingNodeIds(
  currentNodesById: Record<string, Node>,
  nextNodesById: Record<string, Node>
) {
  const currentNodeIds = Object.keys(currentNodesById);
  const nextNodeIds = Object.keys(nextNodesById);
  if (currentNodeIds.length !== nextNodeIds.length) {
    return false;
  }
  return currentNodeIds.every((nodeId) => nodeId in nextNodesById);
}

export function listDocumentWorksetNodeIds(
  currentNodesById: Record<string, Node>,
  nextNodesById: Record<string, Node>
) {
  return Object.entries(nextNodesById)
    .filter(([nodeId, nextNode]) => {
      const currentNode = currentNodesById[nodeId];
      if (!currentNode) {
        return nextNode.content.length > 0 || nextNode.reveal !== null;
      }
      return (
        !hasMatchingBoundaryPreservedFields(currentNode, nextNode) ||
        currentNode.content !== nextNode.content ||
        currentNode.reveal !== nextNode.reveal ||
        currentNode.hideTitleHeading !== nextNode.hideTitleHeading
      );
    })
    .map(([nodeId]) => nodeId);
}

export function reconcileFocusedRendererBoundaryNodes(args: FocusedRendererBoundaryArgs) {
  const previousKeepNodeIds = collectBoundaryKeepNodeIds(
    args.activeNodeId,
    args.currentNodesById,
    args.currentKeepNodeIds
  );
  const nextKeepNodeIds = collectBoundaryKeepNodeIds(
    args.activeNodeId,
    args.nextNodesById,
    args.keepNodeIds
  );
  const affectedNodeIds = new Set<string>([
    ...previousKeepNodeIds,
    ...nextKeepNodeIds,
    ...args.documentWorksetNodeIds
  ]);
  if (args.activeNodeId) {
    affectedNodeIds.add(args.activeNodeId);
  }

  let changed = false;
  const nextBoundaryNodesById = { ...args.currentNodesById };
  for (const nodeId of affectedNodeIds) {
    const sourceNode = args.nextNodesById[nodeId];
    if (!sourceNode) {
      if (nodeId in nextBoundaryNodesById) {
        delete nextBoundaryNodesById[nodeId];
        changed = true;
      }
      continue;
    }
    const keepDocument = args.shouldKeepNodeDocument(nodeId, args.activeNodeId, nextKeepNodeIds);
    const currentNode = args.currentNodesById[nodeId];
    if (args.isBoundaryProjectionReusable(currentNode, sourceNode, keepDocument)) {
      continue;
    }
    nextBoundaryNodesById[nodeId] = args.toRendererBoundaryNode(sourceNode, keepDocument);
    changed = true;
  }

  return changed ? nextBoundaryNodesById : args.currentNodesById;
}
