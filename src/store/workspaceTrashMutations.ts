import { removeInlineAnchorMarkup } from '../features/editor/model/anchorInlineCleanup';
import { isImageClozeLocator, removeImageClozeRegion } from '../features/image-cloze/model/imageCloze';
import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import type { Node } from '../features/nodes/model/nodeTypes';

import { INITIAL_WORKSPACE_NAVIGATION_STATE, sanitizeNavigationState } from './workspaceNavigation';
import { isNodeDocumentLoaded } from './workspaceRendererBoundary';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import {
  collectDeletedNodeIds,
  collectRootDeleteTargets,
  resolveFallbackFromTargets
} from './workspaceTrashMutationTargets';

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

function removeImageRegionFromParent(parentNode: Node, deletedNode: Node, deletedAt: string) {
  const groupedRegions = deletedNode.imageRegions?.flatMap((group) =>
    group.regions.map((region) => ({ attachmentId: group.attachmentId, regionId: region.id }))
  );
  if (groupedRegions && groupedRegions.length > 0) {
    const nextImageRegions = groupedRegions.reduce(
      (current, region) => removeImageClozeRegion(current, region.attachmentId, region.regionId),
      parentNode.imageRegions
    );
    if (nextImageRegions === parentNode.imageRegions) {
      return parentNode;
    }
    return {
      ...parentNode,
      imageRegions: nextImageRegions,
      updatedAt: deletedAt
    };
  }
  const anchorLink = deletedNode.anchorLink;
  if (!anchorLink || anchorLink.kind !== 'cloze' || !isImageClozeLocator(anchorLink.locator)) {
    return parentNode;
  }
  const nextImageRegions = removeImageClozeRegion(parentNode.imageRegions, anchorLink.locator.attachmentId, anchorLink.id);
  if (nextImageRegions === parentNode.imageRegions) {
    return parentNode;
  }
  return {
    ...parentNode,
    imageRegions: nextImageRegions,
    updatedAt: deletedAt
  };
}

function updateDeletedAnchorParent(args: {
  deletedAt: string;
  deletedNode: Node;
  deletedNodeIds: ReadonlySet<string>;
  mode: 'permanent' | 'soft';
  nextNodesById: Record<string, Node>;
}) {
  const anchorLink = args.deletedNode.anchorLink;
  const parentNodeId = args.deletedNode.parentNodeId;
  if (!anchorLink || !parentNodeId || args.deletedNodeIds.has(parentNodeId)) {
    return null;
  }
  const parentNode = args.nextNodesById[parentNodeId];
  if (!parentNode) {
    return null;
  }
  const shouldRemoveTextAnchor =
    args.mode === 'permanent' && !anchorLink.locator && isNodeDocumentLoaded(parentNode);
  const cleanedContent = shouldRemoveTextAnchor ? removeInlineAnchorMarkup(parentNode.content, anchorLink) : parentNode.content;
  const parentWithRemovedRegion = removeImageRegionFromParent(parentNode, args.deletedNode, args.deletedAt);
  if (cleanedContent === parentNode.content && parentWithRemovedRegion === parentNode) {
    return null;
  }
  return {
    parentNodeId,
    updatedParentNode: {
      ...parentWithRemovedRegion,
      content: cleanedContent,
      title: cleanedContent === parentNode.content ? parentWithRemovedRegion.title : deriveNodeTitleFromContent(cleanedContent),
      updatedAt: args.deletedAt
    }
  };
}

function syncDeletedAnchorParents(args: {
  deletedAt: string;
  deletedNodeIds: ReadonlySet<string>;
  mode: 'permanent' | 'soft';
  nextNodesById: Record<string, Node>;
  parentNodesToSync: Map<string, Node>;
  state: WorkspaceState;
}) {
  for (const deletedId of args.deletedNodeIds) {
    const deletedNode = args.state.nodesById[deletedId];
    if (!deletedNode) {
      continue;
    }
    const update = updateDeletedAnchorParent({
      deletedAt: args.deletedAt,
      deletedNode,
      deletedNodeIds: args.deletedNodeIds,
      mode: args.mode,
      nextNodesById: args.nextNodesById
    });
    if (!update) {
      continue;
    }
    args.nextNodesById[update.parentNodeId] = update.updatedParentNode;
    args.parentNodesToSync.set(update.parentNodeId, update.updatedParentNode);
  }
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

export function computeDeleteNodesMutation(state: WorkspaceState, nodeIds: string[]): DeleteNodeMutationResult | null {
  const targetNodeIds = collectRootDeleteTargets(state, nodeIds, false);
  if (targetNodeIds.length === 0) {
    return null;
  }

  const deletedAt = new Date().toISOString();
  const nextNodesById = { ...state.nodesById };
  const parentNodesToSync = new Map<string, Node>();
  const deletedNodeIds = collectDeletedNodeIds(targetNodeIds, state.nodesById);

  syncDeletedAnchorParents({
    deletedAt,
    deletedNodeIds,
    mode: 'soft',
    nextNodesById,
    parentNodesToSync,
    state
  });

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

  const deletedNodeIds = collectDeletedNodeIds(targetNodeIds, state.nodesById);

  const deletedAt = new Date().toISOString();
  const nextNodeOrder = state.nodeOrder.filter((nodeId) => !deletedNodeIds.has(nodeId));
  const nextNodesById = Object.fromEntries(
    Object.entries(state.nodesById).filter(([nodeId]) => !deletedNodeIds.has(nodeId))
  );
  const parentNodesToSync = new Map<string, Node>();
  syncDeletedAnchorParents({
    deletedAt,
    deletedNodeIds,
    mode: 'permanent',
    nextNodesById,
    parentNodesToSync,
    state
  });
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
    deletedAt,
    nodeIds: [...deletedNodeIds],
    nodeOrder: nextNodeOrder,
    parentNodesToSync: [...parentNodesToSync.values()],
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
