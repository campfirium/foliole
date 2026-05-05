import { parseAnchorBlocks } from '../features/editor/model/anchorBlocks';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import type { Node } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';

import { collectNodeSubtreeIds, findFallbackActiveNodeId } from './workspaceHelpers';
import { INITIAL_WORKSPACE_NAVIGATION_STATE, sanitizeNavigationState } from './workspaceNavigation';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';

export interface DeleteNodeMutationResult {
  deletedAt: string;
  nodeIds: string[];
  nodeOrder?: string[];
  parentNodesToSync: Node[];
  patch: Pick<
    WorkspaceState,
    'activeNodeId' | 'navigation' | 'nodeOrder' | 'nodesById' | 'reviewSession' | 'trashedNodeIds'
  >;
}

function removeAnchorTagsForLink(content: string, anchor: { id: string; kind: 'highlight' | 'cloze' }) {
  const matchedBlock = parseAnchorBlocks(content).blocks.find((block) => block.id === anchor.id && block.kind === anchor.kind);
  if (!matchedBlock) {
    return content;
  }
  const before = content.slice(0, matchedBlock.openTagFrom);
  const inner = content.slice(matchedBlock.openTagTo, matchedBlock.closeTagFrom);
  const after = content.slice(matchedBlock.closeTagTo);
  return `${before}${inner}${after}`;
}

function buildDeleteNodePatch(args: {
  state: WorkspaceState;
  nextActiveNodeId: string | null;
  nextNavigation: WorkspaceState['navigation'];
  nextNodeOrder?: string[];
  nextNodesById: WorkspaceState['nodesById'];
  nextTrashedNodeIds: string[];
}): DeleteNodeMutationResult['patch'] {
  const nextState = {
    ...args.state,
    activeNodeId: args.nextActiveNodeId,
    navigation: args.nextNavigation,
    nodeOrder: args.nextNodeOrder ?? args.state.nodeOrder,
    nodesById: args.nextNodesById,
    trashedNodeIds: args.nextTrashedNodeIds
  };
  return {
    activeNodeId: args.nextActiveNodeId,
    navigation: args.nextNavigation,
    nodeOrder: args.nextNodeOrder ?? args.state.nodeOrder,
    nodesById: args.nextNodesById,
    reviewSession: reconcileReviewSession(nextState, args.nextActiveNodeId),
    trashedNodeIds: args.nextTrashedNodeIds
  };
}

function collectRootDeleteTargets(state: WorkspaceState, nodeIds: string[], includeTrashed: boolean) {
  const validIds = nodeIds.filter((nodeId) => {
    const node = state.nodesById[nodeId];
    if (!node || isProtectedRootNode(node)) {
      return false;
    }
    return includeTrashed ? true : !state.trashedNodeIds.includes(nodeId);
  });
  const selectedSet = new Set(validIds);
  return [...new Set(validIds)].filter((nodeId) => {
    const parentNodeId = state.nodesById[nodeId]?.parentNodeId;
    return !parentNodeId || !selectedSet.has(parentNodeId);
  });
}

function resolveFallbackFromTargets(
  targetNodeIds: string[],
  state: WorkspaceState,
  nextNodeOrder: string[],
  nextNodesById: Record<string, Node>,
  excludedNodeIds: ReadonlySet<string>
) {
  const fallbackParentId = targetNodeIds
    .map((nodeId) => state.nodesById[nodeId]?.parentNodeId ?? null)
    .find((parentNodeId) => parentNodeId && nextNodesById[parentNodeId] && !excludedNodeIds.has(parentNodeId));
  return findFallbackActiveNodeId(fallbackParentId ?? null, nextNodeOrder, nextNodesById, excludedNodeIds);
}

export function computeDeleteNodesMutation(state: WorkspaceState, nodeIds: string[]): DeleteNodeMutationResult | null {
  const targetNodeIds = collectRootDeleteTargets(state, nodeIds, false);
  if (targetNodeIds.length === 0) {
    return null;
  }

  const deletedAt = new Date().toISOString();
  const nextNodesById = { ...state.nodesById };
  const parentNodesToSync = new Map<string, Node>();
  const deletedNodeIds = new Set<string>();

  for (const targetNodeId of targetNodeIds) {
    for (const deletedNodeId of collectNodeSubtreeIds(targetNodeId, state.nodesById)) {
      deletedNodeIds.add(deletedNodeId);
    }
  }

  for (const deletedId of deletedNodeIds) {
    const deletedNode = state.nodesById[deletedId];
    const anchorLink = deletedNode?.anchorLink;
    const parentNodeId = deletedNode?.parentNodeId;
    if (!anchorLink || !parentNodeId || deletedNodeIds.has(parentNodeId)) {
      continue;
    }
    const parentNode = nextNodesById[parentNodeId];
    if (!parentNode) {
      continue;
    }
    const cleanedContent = removeAnchorTagsForLink(parentNode.content, anchorLink);
    if (cleanedContent === parentNode.content) {
      continue;
    }
    nextNodesById[parentNodeId] = {
      ...parentNode,
      content: cleanedContent,
      title: deriveNodeTitleFromContent(cleanedContent),
      updatedAt: deletedAt
    };
    parentNodesToSync.set(parentNodeId, nextNodesById[parentNodeId]);
  }

  const nextTrashedNodeIds = [...new Set([...state.trashedNodeIds, ...deletedNodeIds])];
  const hiddenNodeIds = new Set(nextTrashedNodeIds);
  const nextActiveNodeId =
    state.activeNodeId && !hiddenNodeIds.has(state.activeNodeId)
      ? state.activeNodeId
      : resolveFallbackFromTargets(targetNodeIds, state, state.nodeOrder, nextNodesById, hiddenNodeIds);
  const nextNavigation =
    nextActiveNodeId === null
      ? { ...INITIAL_WORKSPACE_NAVIGATION_STATE }
      : sanitizeNavigationState(state.navigation, nextNodesById, hiddenNodeIds);

  return {
    deletedAt,
    nodeIds: [...deletedNodeIds],
    parentNodesToSync: [...parentNodesToSync.values()],
    patch: buildDeleteNodePatch({
      state,
      nextActiveNodeId,
      nextNavigation,
      nextNodesById,
      nextTrashedNodeIds
    })
  };
}

export function computeDeleteNodesPermanentlyMutation(
  state: WorkspaceState,
  nodeIds: string[]
): DeleteNodeMutationResult | null {
  const targetNodeIds = collectRootDeleteTargets(state, nodeIds, true);
  if (targetNodeIds.length === 0) {
    return null;
  }

  const deletedNodeIds = new Set<string>();
  for (const targetNodeId of targetNodeIds) {
    for (const deletedNodeId of collectNodeSubtreeIds(targetNodeId, state.nodesById)) {
      deletedNodeIds.add(deletedNodeId);
    }
  }

  const nextNodeOrder = state.nodeOrder.filter((nodeId) => !deletedNodeIds.has(nodeId));
  const nextNodesById = Object.fromEntries(
    Object.entries(state.nodesById).filter(([nodeId]) => !deletedNodeIds.has(nodeId))
  );
  const nextTrashedNodeIds = state.trashedNodeIds.filter((nodeId) => !deletedNodeIds.has(nodeId));
  const hiddenNodeIds = new Set(nextTrashedNodeIds);
  const nextActiveNodeId =
    state.activeNodeId && !deletedNodeIds.has(state.activeNodeId) && !hiddenNodeIds.has(state.activeNodeId)
      ? state.activeNodeId
      : resolveFallbackFromTargets(targetNodeIds, state, nextNodeOrder, nextNodesById, hiddenNodeIds);
  const nextNavigation =
    nextActiveNodeId === null
      ? { ...INITIAL_WORKSPACE_NAVIGATION_STATE }
      : sanitizeNavigationState(state.navigation, nextNodesById, new Set([...deletedNodeIds, ...nextTrashedNodeIds]));

  return {
    deletedAt: new Date().toISOString(),
    nodeIds: [...deletedNodeIds],
    nodeOrder: nextNodeOrder,
    parentNodesToSync: [],
    patch: buildDeleteNodePatch({
      state,
      nextActiveNodeId,
      nextNavigation,
      nextNodeOrder,
      nextNodesById,
      nextTrashedNodeIds
    })
  };
}
