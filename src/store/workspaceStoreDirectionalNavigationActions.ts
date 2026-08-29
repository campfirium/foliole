import { markNodeSelectionApplied } from '../shared/platform/performanceDiagnosticsProbe';

import { resolveWorkspaceBrowseRootForTarget } from './workspaceBrowseRoot';
import { pushNavigationHistory, type NodeNavigationResult } from './workspaceNavigation';
import {
  resolveBackNavigationTarget,
  resolveLastChildNavigationTarget,
  resolveForwardNavigationTarget,
  resolveParentNavigationTarget
} from './workspaceNavigationTargets';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { persistNodeOpened } from './workspaceStoreNodeOpenState';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;
type DirectionalAction = () => NodeNavigationResult | null;
interface DirectionalTransition {
  focusAnchor: NodeNavigationResult['focusAnchor'];
  navigation: WorkspaceState['navigation'];
  nodeId: string | null;
  targetContext?: boolean;
}

function buildTargetState(
  state: WorkspaceState,
  nodeId: string,
  navigation: WorkspaceState['navigation'],
  targetContext = false
) {
  return {
    activeNodeId: nodeId,
    browseRootNodeId: resolveWorkspaceBrowseRootForTarget({
      browseRootNodeId: state.browseRootNodeId,
      intent: targetContext ? 'target-context' : 'current-context',
      nodesById: state.nodesById,
      targetNodeId: nodeId,
      trashedNodeIds: state.trashedNodeIds
    }),
    navigation,
    reviewSession: reconcileReviewSession(state, nodeId)
  };
}

function createDirectionalAction(
  set: WorkspaceSet,
  transition: (state: WorkspaceState) => DirectionalTransition | null
): DirectionalAction {
  return () => {
    let result: NodeNavigationResult | null = null;
    let openedNodeId: string | null = null;
    const openedAt = new Date().toISOString();
    set((state) => {
      const target = transition(state);
      if (!target) return state;
      if (!target.nodeId) return { navigation: target.navigation };
      markNodeSelectionApplied(target.nodeId, state.nodesById);
      result = { focusAnchor: target.focusAnchor, nodeId: target.nodeId };
      openedNodeId = target.nodeId;
      return buildTargetState(state, target.nodeId, target.navigation, target.targetContext);
    });
    if (openedNodeId) void persistNodeOpened(set, openedNodeId, openedAt);
    return result;
  };
}

function resolveBackTransition(state: WorkspaceState): DirectionalTransition | null {
  const target = resolveBackNavigationTarget(state);
  if (!state.activeNodeId || !target.nodeId) {
    return target.remainingStack.length === state.navigation.backStack.length
      ? null
      : { focusAnchor: null, navigation: { ...state.navigation, backStack: target.remainingStack }, nodeId: null };
  }
  return {
    focusAnchor: null,
    navigation: { backStack: target.remainingStack, forwardStack: [state.activeNodeId, ...state.navigation.forwardStack] },
    nodeId: target.nodeId,
    targetContext: true
  };
}

function resolveForwardTransition(state: WorkspaceState): DirectionalTransition | null {
  const target = resolveForwardNavigationTarget(state);
  if (!state.activeNodeId || !target.nodeId) {
    return target.remainingStack.length === state.navigation.forwardStack.length
      ? null
      : { focusAnchor: null, navigation: { ...state.navigation, forwardStack: target.remainingStack }, nodeId: null };
  }
  return {
    focusAnchor: null,
    navigation: {
      backStack: pushNavigationHistory(state.navigation.backStack, state.activeNodeId),
      forwardStack: target.remainingStack
    },
    nodeId: target.nodeId,
    targetContext: true
  };
}

function resolveParentTransition(state: WorkspaceState): DirectionalTransition | null {
  const nodeId = resolveParentNavigationTarget(state);
  if (!state.activeNodeId || !nodeId) return null;
  return {
    focusAnchor: state.nodesById[state.activeNodeId]?.anchorLink ?? null,
    navigation: { backStack: pushNavigationHistory(state.navigation.backStack, state.activeNodeId), forwardStack: [] },
    nodeId
  };
}

function resolveLastChildTransition(state: WorkspaceState): DirectionalTransition | null {
  const nodeId = resolveLastChildNavigationTarget(state);
  if (!state.activeNodeId || !nodeId) return null;
  return {
    focusAnchor: null,
    navigation: { backStack: pushNavigationHistory(state.navigation.backStack, state.activeNodeId), forwardStack: [] },
    nodeId
  };
}

export function createDirectionalNavigationActions(set: WorkspaceSet) {
  return {
    goBack: createDirectionalAction(set, resolveBackTransition),
    goForward: createDirectionalAction(set, resolveForwardTransition),
    goToLastChild: createDirectionalAction(set, resolveLastChildTransition),
    goToParent: createDirectionalAction(set, resolveParentTransition)
  };
}
