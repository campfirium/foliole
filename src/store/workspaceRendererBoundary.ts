import type { NodeKind } from '../../lib/core/nodes/nodeKind';
import type { Node } from '../features/nodes/model/nodeTypes';
import { hasNodeContent, hasNodeReveal } from '../features/nodes/model/nodeTypes';

interface WorkspaceRendererBoundaryStateLike {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
}

export interface WorkspaceNodeDocument {
  content: string;
  hideTitleHeading: boolean;
  kind: NodeKind;
  reveal: string | null;
}

export function isNodeDocumentLoaded(node: Node | null | undefined) {
  if (!node) {
    return false;
  }
  const contentLoaded = !hasNodeContent(node) || node.content.length > 0;
  const revealLoaded = !hasNodeReveal(node) || node.reveal !== null;
  return contentLoaded && revealLoaded;
}

export function toRendererBoundaryNode(node: Node, keepDocument: boolean): Node {
  const nextHasContent = hasNodeContent(node);
  const nextHasReveal = hasNodeReveal(node);
  if (keepDocument) {
    return {
      ...node,
      hasContent: nextHasContent,
      hasReveal: nextHasReveal
    };
  }
  return {
    ...node,
    content: '',
    hasContent: nextHasContent,
    reveal: null,
    hasReveal: nextHasReveal
  };
}

export function mergeWorkspaceNodeDocument(node: Node, document: WorkspaceNodeDocument): Node {
  return {
    ...node,
    content: document.content,
    hasContent: document.content.trim().length > 0,
    hideTitleHeading: document.hideTitleHeading,
    kind: document.kind,
    reveal: document.reveal,
    hasReveal: document.reveal !== null
  };
}

export function trimWorkspaceNodesForRendererBoundary(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  keepNodeIds: ReadonlySet<string> = new Set()
) {
  return Object.fromEntries(
    Object.entries(nodesById).map(([nodeId, node]) => [
      nodeId,
      toRendererBoundaryNode(node, nodeId === activeNodeId || keepNodeIds.has(nodeId))
    ])
  );
}

function listDocumentWorksetNodeIds(
  currentNodesById: Record<string, Node>,
  nextNodesById: Record<string, Node>
) {
  return Object.entries(nextNodesById)
    .filter(([nodeId, nextNode]) => {
      const currentNode = currentNodesById[nodeId];
      if (!currentNode) {
        return nextNode.content.length > 0 || nextNode.reveal !== null;
      }
      return (
        currentNode.content !== nextNode.content ||
        currentNode.reveal !== nextNode.reveal ||
        currentNode.hideTitleHeading !== nextNode.hideTitleHeading
      );
    })
    .map(([nodeId]) => nodeId);
}

export function enforceWorkspaceRendererBoundary<T extends WorkspaceRendererBoundaryStateLike>(
  state: T | Partial<T>,
  currentState: T,
  keepNodeIds: ReadonlySet<string> = new Set()
): T | Partial<T> {
  if (!('activeNodeId' in state) && !('nodesById' in state)) {
    return state;
  }

  const nextActiveNodeId = 'activeNodeId' in state ? state.activeNodeId ?? null : currentState.activeNodeId;
  const nextNodesById = 'nodesById' in state ? state.nodesById ?? currentState.nodesById : currentState.nodesById;
  const nextKeepNodeIds = new Set(keepNodeIds);

  if (!('activeNodeId' in state)) {
    for (const nodeId of listDocumentWorksetNodeIds(currentState.nodesById, nextNodesById)) {
      nextKeepNodeIds.add(nodeId);
    }
  }

  return {
    ...state,
    nodesById: trimWorkspaceNodesForRendererBoundary(nextActiveNodeId, nextNodesById, nextKeepNodeIds)
  };
}
