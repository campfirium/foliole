import { markNodeSelectionApplied } from '../shared/platform/performanceDiagnosticsProbe';

import { pushNavigationHistory, resolveAncestorAnchorLink, type NodeNavigationResult } from './workspaceNavigation';
import type { WorkspaceState } from './workspaceStore';
import { markNodeOpenedViewState } from './workspaceStoreOpenedNodeView';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

interface WorkspaceNavigationActions {
  goBack: () => NodeNavigationResult | null;
  goForward: () => NodeNavigationResult | null;
  goToParent: () => NodeNavigationResult | null;
  jumpToAncestorNode: (ancestorNodeId: string) => NodeNavigationResult | null;
  openNode: (nodeId: string) => NodeNavigationResult | null;
}

function isAvailableNode(state: WorkspaceState, nodeId: string) {
  return Boolean(state.nodesById[nodeId]) && !state.trashedNodeIds.includes(nodeId);
}

function syncReviewSessionSelection(state: WorkspaceState, nodeId: string) {
  if (!state.reviewSession.currentNodeId || !state.reviewSession.queueNodeIds.includes(nodeId)) {
    return state.reviewSession;
  }
  return {
    ...state.reviewSession,
    currentNodeId: nodeId,
    isAnswerRevealed: false,
    queueNodeIds: [nodeId, ...state.reviewSession.queueNodeIds.filter((queuedNodeId) => queuedNodeId !== nodeId)]
  };
}

function isReviewSessionSelectionSynced(state: WorkspaceState, nodeId: string) {
  if (state.reviewSession.currentNodeId !== nodeId) {
    return false;
  }
  return state.reviewSession.queueNodeIds[0] === nodeId;
}

function buildNavigationNodeState(
  state: WorkspaceState,
  nodeId: string,
  navigation: WorkspaceState['navigation'],
  nodeViewById: WorkspaceState['nodeViewById'] = state.nodeViewById
) {
  return {
    activeNodeId: nodeId,
    navigation,
    nodeViewById,
    reviewSession: syncReviewSessionSelection(state, nodeId)
  };
}

function createOpenNodeAction(set: WorkspaceSet) {
  return (nodeId: string) => {
    let nextResult: NodeNavigationResult | null = null;
    set((state) => {
      if (!isAvailableNode(state, nodeId)) {
        return state;
      }
      const nodeViewById = markNodeOpenedViewState(state, nodeId);
      if (state.activeNodeId === nodeId && isReviewSessionSelectionSynced(state, nodeId)) {
        return nodeViewById === state.nodeViewById ? state : { nodeViewById };
      }
      markNodeSelectionApplied(nodeId, state.nodesById);
      nextResult = { focusAnchor: null, nodeId };
      return buildNavigationNodeState(
        state,
        nodeId,
        state.activeNodeId
          ? {
              backStack: pushNavigationHistory(state.navigation.backStack, state.activeNodeId),
              forwardStack: []
            }
          : { ...state.navigation, forwardStack: [] },
        nodeViewById
      );
    });
    return nextResult;
  };
}

function createGoBackAction(set: WorkspaceSet) {
  return () => {
    let nextResult: NodeNavigationResult | null = null;
    set((state) => {
      const currentNodeId = state.activeNodeId;
      const targetNodeId = state.navigation.backStack[state.navigation.backStack.length - 1];
      if (!currentNodeId || !targetNodeId || !isAvailableNode(state, targetNodeId)) {
        return state;
      }
      markNodeSelectionApplied(targetNodeId, state.nodesById);
      nextResult = { focusAnchor: null, nodeId: targetNodeId };
      return buildNavigationNodeState(
        state,
        targetNodeId,
        {
          backStack: state.navigation.backStack.slice(0, -1),
          forwardStack: [currentNodeId, ...state.navigation.forwardStack]
        },
        markNodeOpenedViewState(state, targetNodeId)
      );
    });
    return nextResult;
  };
}

function createGoForwardAction(set: WorkspaceSet) {
  return () => {
    let nextResult: NodeNavigationResult | null = null;
    set((state) => {
      const currentNodeId = state.activeNodeId;
      const targetNodeId = state.navigation.forwardStack[0];
      if (!currentNodeId || !targetNodeId || !isAvailableNode(state, targetNodeId)) {
        return state;
      }
      markNodeSelectionApplied(targetNodeId, state.nodesById);
      nextResult = { focusAnchor: null, nodeId: targetNodeId };
      return buildNavigationNodeState(
        state,
        targetNodeId,
        {
          backStack: pushNavigationHistory(state.navigation.backStack, currentNodeId),
          forwardStack: state.navigation.forwardStack.slice(1)
        },
        markNodeOpenedViewState(state, targetNodeId)
      );
    });
    return nextResult;
  };
}

function createGoToParentAction(set: WorkspaceSet) {
  return () => {
    let nextResult: NodeNavigationResult | null = null;
    set((state) => {
      const currentNodeId = state.activeNodeId;
      if (!currentNodeId) {
        return state;
      }
      const currentNode = state.nodesById[currentNodeId];
      const parentNodeId = currentNode?.parentNodeId;
      if (!currentNode || !parentNodeId || !isAvailableNode(state, parentNodeId)) {
        return state;
      }
      markNodeSelectionApplied(parentNodeId, state.nodesById);
      nextResult = { focusAnchor: currentNode.anchorLink ?? null, nodeId: parentNodeId };
      return buildNavigationNodeState(
        state,
        parentNodeId,
        {
          backStack: pushNavigationHistory(state.navigation.backStack, currentNodeId),
          forwardStack: []
        },
        markNodeOpenedViewState(state, parentNodeId)
      );
    });
    return nextResult;
  };
}

function createJumpToAncestorAction(set: WorkspaceSet) {
  return (ancestorNodeId: string) => {
    let nextResult: NodeNavigationResult | null = null;
    set((state) => {
      const currentNodeId = state.activeNodeId;
      if (!currentNodeId || currentNodeId === ancestorNodeId || !isAvailableNode(state, ancestorNodeId)) {
        return state;
      }
      const ancestorTarget = resolveAncestorAnchorLink(currentNodeId, ancestorNodeId, state.nodesById);
      if (!ancestorTarget.isAncestor) {
        return state;
      }
      markNodeSelectionApplied(ancestorNodeId, state.nodesById);
      nextResult = { focusAnchor: ancestorTarget.focusAnchor, nodeId: ancestorNodeId };
      return buildNavigationNodeState(
        state,
        ancestorNodeId,
        {
          backStack: pushNavigationHistory(state.navigation.backStack, currentNodeId),
          forwardStack: []
        },
        markNodeOpenedViewState(state, ancestorNodeId)
      );
    });
    return nextResult;
  };
}

export function createWorkspaceNavigationActions(set: WorkspaceSet): WorkspaceNavigationActions {
  return {
    openNode: createOpenNodeAction(set),
    goBack: createGoBackAction(set),
    goForward: createGoForwardAction(set),
    goToParent: createGoToParentAction(set),
    jumpToAncestorNode: createJumpToAncestorAction(set)
  };
}
