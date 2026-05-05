import { pushNavigationHistory, resolveAncestorAnchorLink, type NodeNavigationResult } from './workspaceNavigation';
import type { WorkspaceState } from './workspaceStore';

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

export function createWorkspaceNavigationActions(set: WorkspaceSet): WorkspaceNavigationActions {
  const isAvailableNode = (state: WorkspaceState, nodeId: string) =>
    Boolean(state.nodesById[nodeId]) && !state.trashedNodeIds.includes(nodeId);

  return {
    openNode: (nodeId) => {
      let nextResult: NodeNavigationResult | null = null;
      set((state) => {
        if (!isAvailableNode(state, nodeId) || state.activeNodeId === nodeId) {
          return state;
        }

        nextResult = {
          focusAnchor: null,
          nodeId
        };
        return {
          activeNodeId: nodeId,
          navigation: state.activeNodeId
            ? {
                backStack: pushNavigationHistory(state.navigation.backStack, state.activeNodeId),
                forwardStack: []
              }
            : { ...state.navigation, forwardStack: [] }
        };
      });
      return nextResult;
    },
    goBack: () => {
      let nextResult: NodeNavigationResult | null = null;
      set((state) => {
        const currentNodeId = state.activeNodeId;
        const targetNodeId = state.navigation.backStack[state.navigation.backStack.length - 1];
        if (!currentNodeId || !targetNodeId || !isAvailableNode(state, targetNodeId)) {
          return state;
        }

        nextResult = {
          focusAnchor: null,
          nodeId: targetNodeId
        };
        return {
          activeNodeId: targetNodeId,
          navigation: {
            backStack: state.navigation.backStack.slice(0, -1),
            forwardStack: [currentNodeId, ...state.navigation.forwardStack]
          }
        };
      });
      return nextResult;
    },
    goForward: () => {
      let nextResult: NodeNavigationResult | null = null;
      set((state) => {
        const currentNodeId = state.activeNodeId;
        const targetNodeId = state.navigation.forwardStack[0];
        if (!currentNodeId || !targetNodeId || !isAvailableNode(state, targetNodeId)) {
          return state;
        }

        nextResult = {
          focusAnchor: null,
          nodeId: targetNodeId
        };
        return {
          activeNodeId: targetNodeId,
          navigation: {
            backStack: pushNavigationHistory(state.navigation.backStack, currentNodeId),
            forwardStack: state.navigation.forwardStack.slice(1)
          }
        };
      });
      return nextResult;
    },
    goToParent: () => {
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

        nextResult = {
          focusAnchor: currentNode.anchorLink ?? null,
          nodeId: parentNodeId
        };
        return {
          activeNodeId: parentNodeId,
          navigation: {
            backStack: pushNavigationHistory(state.navigation.backStack, currentNodeId),
            forwardStack: []
          }
        };
      });
      return nextResult;
    },
    jumpToAncestorNode: (ancestorNodeId) => {
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

        nextResult = {
          focusAnchor: ancestorTarget.focusAnchor,
          nodeId: ancestorNodeId
        };
        return {
          activeNodeId: ancestorNodeId,
          navigation: {
            backStack: pushNavigationHistory(state.navigation.backStack, currentNodeId),
            forwardStack: []
          }
        };
      });
      return nextResult;
    }
  };
}
