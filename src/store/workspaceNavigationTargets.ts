import type { Node } from '../features/nodes/model/nodeTypes';

import { isCanonicalVisibleNodeId } from './workspaceCanonicalSelectors';
import type { WorkspaceNavigationState } from './workspaceNavigation';

export interface WorkspaceNavigationTargetSource {
  activeNodeId: string | null;
  navigation: WorkspaceNavigationState;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeDeletedAtById: Record<string, string | undefined>;
  trashedNodeIds: string[];
}

export interface HistoryNavigationTarget {
  nodeId: string | null;
  remainingStack: string[];
}

export function isAvailableNavigationNode(source: WorkspaceNavigationTargetSource, nodeId: string) {
  return isCanonicalVisibleNodeId(source, nodeId);
}

export function resolveBackNavigationTarget(source: WorkspaceNavigationTargetSource): HistoryNavigationTarget {
  for (let index = source.navigation.backStack.length - 1; index >= 0; index -= 1) {
    const nodeId = source.navigation.backStack[index]!;
    if (isAvailableNavigationNode(source, nodeId)) {
      return { nodeId, remainingStack: source.navigation.backStack.slice(0, index) };
    }
  }
  return { nodeId: null, remainingStack: [] };
}

export function resolveForwardNavigationTarget(source: WorkspaceNavigationTargetSource): HistoryNavigationTarget {
  for (let index = 0; index < source.navigation.forwardStack.length; index += 1) {
    const nodeId = source.navigation.forwardStack[index]!;
    if (isAvailableNavigationNode(source, nodeId)) {
      return { nodeId, remainingStack: source.navigation.forwardStack.slice(index + 1) };
    }
  }
  return { nodeId: null, remainingStack: [] };
}

export function resolveParentNavigationTarget(source: WorkspaceNavigationTargetSource) {
  const parentNodeId = source.activeNodeId
    ? source.nodesById[source.activeNodeId]?.parentNodeId
    : null;
  return parentNodeId && isAvailableNavigationNode(source, parentNodeId) ? parentNodeId : null;
}

export function resolveLastChildNavigationTarget(source: WorkspaceNavigationTargetSource) {
  if (!source.activeNodeId) return null;
  for (let index = source.nodeOrder.length - 1; index >= 0; index -= 1) {
    const nodeId = source.nodeOrder[index]!;
    if (
      source.nodesById[nodeId]?.parentNodeId === source.activeNodeId &&
      isAvailableNavigationNode(source, nodeId)
    ) {
      return nodeId;
    }
  }
  return null;
}
