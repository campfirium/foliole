import type { Node } from '../features/nodes/model/nodeTypes';
import { hasNodeContent, hasNodeReveal } from '../features/nodes/model/nodeTypes';

export interface WorkspaceNodeDocument {
  content: string;
  hideTitleHeading: boolean;
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
