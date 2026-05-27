import { hasNodeContent } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';

import { isSequentialReadingSourceFolder } from './workspaceSequentialReadingSources';
import type { WorkspaceState } from './workspaceStore';

function hasShelvedSelfOrAncestor(
  nodeId: string,
  nodesById: WorkspaceState['nodesById']
) {
  const visited = new Set<string>();
  let current = nodesById[nodeId];
  while (current && !visited.has(current.id)) {
    if (current.shelvedAt) {
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
  nodesById: WorkspaceState['nodesById']
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
  nodesById: WorkspaceState['nodesById']
) {
  const node = nodesById[nodeId];
  if (!node || node.kind !== 'topic') {
    return false;
  }
  const readingState = node.reading?.state;
  return (
    hasNodeContent(node) &&
    isReadingReviewItemNode(node) &&
    !hasShelvedSelfOrAncestor(nodeId, nodesById) &&
    (!readingState || readingState === 'active' || readingState === 'locked')
  );
}

export function occupiesSequentialReadingFolderSlot(args: {
  nodeOrder: string[];
  nodesById: WorkspaceState['nodesById'];
  rootNodeId: string;
}) {
  return args.nodeOrder.some(
    (nodeId) =>
      isInSubtree(nodeId, args.rootNodeId, args.nodesById) &&
      hasReadingSlotCapacity(nodeId, args.nodesById)
  );
}

export function isUnavailableSequentialTopic(
  node: WorkspaceState['nodesById'][string] | undefined
) {
  if (!node) return true;
  if (node.shelvedAt) return true;
  const reading = node.reading;
  return reading?.state === 'dismissed' || reading?.state === 'done';
}

export function unavailableFolderTopicOccupiesSlot(args: {
  nodeId: string;
  nodeOrder: string[];
  nodesById: WorkspaceState['nodesById'];
  sourceNode: WorkspaceState['nodesById'][string] | undefined;
}) {
  return (
    isSequentialReadingSourceFolder(args.sourceNode) &&
    occupiesSequentialReadingFolderSlot({
      nodeOrder: args.nodeOrder,
      nodesById: args.nodesById,
      rootNodeId: args.nodeId
    })
  );
}
