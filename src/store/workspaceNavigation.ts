import type { Node, NodeAnchorLink } from '../features/nodes/model/nodeTypes';

const NAVIGATION_STACK_LIMIT = 200;

export interface WorkspaceNavigationState {
  backStack: string[];
  forwardStack: string[];
}

export interface NodeNavigationResult {
  focusAnchor: NodeAnchorLink | null;
  nodeId: string;
}

export interface AncestorNavigationTarget {
  focusAnchor: NodeAnchorLink | null;
  isAncestor: boolean;
}

export const INITIAL_WORKSPACE_NAVIGATION_STATE: WorkspaceNavigationState = {
  backStack: [],
  forwardStack: []
};

export function pushNavigationHistory(stack: string[], nodeId: string): string[] {
  if (stack[stack.length - 1] === nodeId) {
    return stack;
  }
  const next = [...stack, nodeId];
  if (next.length <= NAVIGATION_STACK_LIMIT) {
    return next;
  }
  return next.slice(next.length - NAVIGATION_STACK_LIMIT);
}

export function sanitizeNavigationState(
  navigation: WorkspaceNavigationState,
  nodesById: Record<string, Node>,
  deletedNodeIds: Set<string>
): WorkspaceNavigationState {
  const isKnownNodeId = (nodeId: string) => !deletedNodeIds.has(nodeId) && Boolean(nodesById[nodeId]);
  return {
    backStack: navigation.backStack.filter(isKnownNodeId),
    forwardStack: navigation.forwardStack.filter(isKnownNodeId)
  };
}

export function resolveAncestorAnchorLink(
  activeNodeId: string,
  ancestorNodeId: string,
  nodesById: Record<string, Node>
): AncestorNavigationTarget {
  const activeNode = nodesById[activeNodeId];
  if (!activeNode) {
    return { focusAnchor: null, isAncestor: false };
  }

  let cursorId: string | null = activeNodeId;
  let nearestAnchor: Node['anchorLink'] = null;
  while (cursorId !== null) {
    const cursor: Node | undefined = nodesById[cursorId];
    if (!cursor) {
      return { focusAnchor: null, isAncestor: false };
    }
    nearestAnchor = nearestAnchor ?? cursor.anchorLink ?? null;
    if (cursor.parentNodeId === ancestorNodeId) {
      return {
        focusAnchor: nearestAnchor,
        isAncestor: true
      };
    }
    cursorId = cursor.parentNodeId;
  }
  return { focusAnchor: null, isAncestor: false };
}
