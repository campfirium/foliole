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
  let cursorId: string | null = activeNodeId;
  let nearestAnchor: NodeAnchorLink | null = null;
  let nearestLocatorAnchor: NodeAnchorLink | null = null;
  while (cursorId !== null) {
    const cursor: Node | undefined = nodesById[cursorId];
    if (!cursor) {
      return { focusAnchor: null, isAncestor: false };
    }
    if (!nearestAnchor && cursor.anchorLink) {
      nearestAnchor = cursor.anchorLink;
    }
    if (
      !nearestLocatorAnchor &&
      (cursor.anchorLink?.kind === 'highlight' || cursor.anchorLink?.kind === 'cloze') &&
      cursor.anchorLink.locator
    ) {
      nearestLocatorAnchor = cursor.anchorLink;
    }
    if (cursor.parentNodeId === ancestorNodeId) {
      return {
        focusAnchor: nearestLocatorAnchor ?? nearestAnchor ?? null,
        isAncestor: true
      };
    }
    cursorId = cursor.parentNodeId;
  }
  return { focusAnchor: null, isAncestor: false };
}
