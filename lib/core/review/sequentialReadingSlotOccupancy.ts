import { hasNodeContent } from '../nodes/nodeContentFlags.js';

import { isReadingReviewItemNode } from './reviewItemKind.js';
import { isSequentialReadingSourceFolder } from './sequentialReadingSources.js';
import { sequentialReadingState, type SequentialReadingStateNodes as SequentialReadingNodes } from './sequentialReadingState.js';


/** A trashed node keeps its parent for restore, so Sequential Reading must skip it explicitly. */
export function isTrashedSequentialNode(
  node: SequentialReadingNodes[string] | undefined,
  trashed: ReadonlySet<string>
) {
  return Boolean(node && (node.deletedAt || trashed.has(node.id)));
}

function hasWithdrawnSelfOrAncestor(
  nodeId: string,
  nodesById: SequentialReadingNodes,
  trashed: ReadonlySet<string>
) {
  const visited = new Set<string>();
  let current = nodesById[nodeId];
  while (current && !visited.has(current.id)) {
    if (current.shelvedAt || isTrashedSequentialNode(current, trashed)) {
      return true;
    }
    visited.add(current.id);
    current = current.parentNodeId ? nodesById[current.parentNodeId] : undefined;
  }
  return false;
}

function isInSubtree(
  nodeId: string,
  rootNodeId: string,
  nodesById: SequentialReadingNodes
) {
  if (nodeId === rootNodeId) {
    return true;
  }
  const visited = new Set<string>();
  let current = nodesById[nodeId];
  while (current?.parentNodeId && !visited.has(current.parentNodeId)) {
    if (current.parentNodeId === rootNodeId) {
      return true;
    }
    visited.add(current.parentNodeId);
    current = nodesById[current.parentNodeId];
  }
  return false;
}

function hasReadingSlotCapacity(
  nodeId: string,
  nodesById: SequentialReadingNodes,
  trashed: ReadonlySet<string>
) {
  const node = nodesById[nodeId];
  if (!node || node.kind !== 'topic') {
    return false;
  }
  const readingState = sequentialReadingState(node);
  return (
    hasNodeContent(node) &&
    isReadingReviewItemNode(node) &&
    !hasWithdrawnSelfOrAncestor(nodeId, nodesById, trashed) &&
    (!readingState || readingState === 'active' || readingState === 'locked')
  );
}

export function occupiesSequentialReadingFolderSlot(args: {
  nodeOrder: string[];
  nodesById: SequentialReadingNodes;
  rootNodeId: string;
  trashedNodeIds?: readonly string[] | undefined;
}) {
  const trashed = new Set(args.trashedNodeIds ?? []);
  return args.nodeOrder.some(
    (nodeId) =>
      isInSubtree(nodeId, args.rootNodeId, args.nodesById) &&
      hasReadingSlotCapacity(nodeId, args.nodesById, trashed)
  );
}

export function isUnavailableSequentialTopic(
  node: SequentialReadingNodes[string] | undefined
) {
  if (!node) return true;
  if (node.shelvedAt) return true;
  const state = sequentialReadingState(node);
  return state === 'dismissed' || state === 'done';
}

export function unavailableFolderTopicOccupiesSlot(args: {
  nodeId: string;
  nodeOrder: string[];
  nodesById: SequentialReadingNodes;
  sourceNode: SequentialReadingNodes[string] | undefined;
  trashedNodeIds?: readonly string[] | undefined;
}) {
  return (
    isSequentialReadingSourceFolder(args.sourceNode) &&
    occupiesSequentialReadingFolderSlot({
      nodeOrder: args.nodeOrder,
      nodesById: args.nodesById,
      rootNodeId: args.nodeId,
      trashedNodeIds: args.trashedNodeIds
    })
  );
}
