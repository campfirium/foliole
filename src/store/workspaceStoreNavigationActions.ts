import { markNodeSelectionApplied } from '../shared/platform/performanceDiagnosticsProbe';

import { resolveWorkspaceBrowseRootForTarget, type WorkspaceBrowseRootIntent } from './workspaceBrowseRoot';
import { isCanonicalVisibleNodeId } from './workspaceCanonicalSelectors';
import { pushNavigationHistory, resolveAncestorAnchorLink, type NodeNavigationResult } from './workspaceNavigation';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';

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
  openNode: (nodeId: string, browseRootIntent?: WorkspaceBrowseRootIntent) => NodeNavigationResult | null;
}

function isAvailableNode(state: WorkspaceState, nodeId: string) {
  return isCanonicalVisibleNodeId({
    nodeOrder: state.nodeOrder,
    nodesById: state.nodesById,
    trashedNodeDeletedAtById: state.trashedNodeDeletedAtById,
    trashedNodeIds: state.trashedNodeIds
  }, nodeId);
}

function buildNavigationNodeState(
  state: WorkspaceState,
  nodeId: string,
  navigation: WorkspaceState['navigation'],
  browseRootIntent: WorkspaceBrowseRootIntent = 'current-context'
) {
  return {
    activeNodeId: nodeId,
    browseRootNodeId: resolveWorkspaceBrowseRootForTarget({
      browseRootNodeId: state.browseRootNodeId,
      intent: browseRootIntent,
      nodesById: state.nodesById,
      targetNodeId: nodeId,
      trashedNodeIds: state.trashedNodeIds
    }),
    navigation,
    reviewSession: reconcileReviewSession(state, nodeId)
  };
}

function createOpenNodeAction(set: WorkspaceSet) {
  return (nodeId: string, browseRootIntent: WorkspaceBrowseRootIntent = 'current-context') => {
    let nextResult: NodeNavigationResult | null = null;
    const openedAt = new Date().toISOString();
    set((state) => {
      if (!isAvailableNode(state, nodeId)) {
        return state;
      }
      if (state.activeNodeId === nodeId) {
        nextResult = { focusAnchor: null, nodeId };
        return state;
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
        browseRootIntent
      );
    });
    if (nextResult) void persistNodeOpened(set, nodeId, openedAt);
    return nextResult;
  };
}

function createGoBackAction(set: WorkspaceSet) {
  return () => {
    let nextResult: NodeNavigationResult | null = null;
    let openedNodeId: string | null = null;
    const openedAt = new Date().toISOString();
    set((state) => {
      const currentNodeId = state.activeNodeId;
      const targetNodeId = state.navigation.backStack[state.navigation.backStack.length - 1];
      if (!currentNodeId || !targetNodeId || !isAvailableNode(state, targetNodeId)) {
        return state;
      }
      markNodeSelectionApplied(targetNodeId, state.nodesById);
      nextResult = { focusAnchor: null, nodeId: targetNodeId };
      openedNodeId = targetNodeId;
      return buildNavigationNodeState(
        state,
        targetNodeId,
        {
          backStack: state.navigation.backStack.slice(0, -1),
          forwardStack: [currentNodeId, ...state.navigation.forwardStack]
        },
        'target-context'
      );
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, openedAt);
    return nextResult;
  };
}

function createGoForwardAction(set: WorkspaceSet) {
  return () => {
    let nextResult: NodeNavigationResult | null = null;
    let openedNodeId: string | null = null;
    const openedAt = new Date().toISOString();
    set((state) => {
      const currentNodeId = state.activeNodeId;
      const targetNodeId = state.navigation.forwardStack[0];
      if (!currentNodeId || !targetNodeId || !isAvailableNode(state, targetNodeId)) {
        return state;
      }
      markNodeSelectionApplied(targetNodeId, state.nodesById);
      nextResult = { focusAnchor: null, nodeId: targetNodeId };
      openedNodeId = targetNodeId;
      return buildNavigationNodeState(
        state,
        targetNodeId,
        {
          backStack: pushNavigationHistory(state.navigation.backStack, currentNodeId),
          forwardStack: state.navigation.forwardStack.slice(1)
        },
        'target-context'
      );
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, openedAt);
    return nextResult;
  };
}

function createGoToParentAction(set: WorkspaceSet) {
  return () => {
    let nextResult: NodeNavigationResult | null = null;
    let openedNodeId: string | null = null;
    const openedAt = new Date().toISOString();
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
      openedNodeId = parentNodeId;
      return buildNavigationNodeState(
        state,
        parentNodeId,
        {
          backStack: pushNavigationHistory(state.navigation.backStack, currentNodeId),
          forwardStack: []
        }
      );
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, openedAt);
    return nextResult;
  };
}

function createJumpToAncestorAction(set: WorkspaceSet) {
  return (ancestorNodeId: string) => {
    let nextResult: NodeNavigationResult | null = null;
    let openedNodeId: string | null = null;
    const openedAt = new Date().toISOString();
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
      openedNodeId = ancestorNodeId;
      return buildNavigationNodeState(
        state,
        ancestorNodeId,
        {
          backStack: pushNavigationHistory(state.navigation.backStack, currentNodeId),
          forwardStack: []
        }
      );
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, openedAt);
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
