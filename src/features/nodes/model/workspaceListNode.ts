import type {
  Node,
  NodeAnchorLink,
  NodeReadingProfile,
  NodeReviewProfile,
  NodeSpecialKind
} from './nodeTypes';
import { hasNodeContent, hasNodeReveal } from './nodeTypes';

export interface WorkspaceListNode {
  anchorLink?: NodeAnchorLink | null;
  createdAt: string;
  desiredRetention?: number | null;
  hasContent: boolean;
  hasReveal: boolean;
  id: string;
  parentNodeId: string | null;
  priority?: number | null;
  reading?: NodeReadingProfile | null;
  review: NodeReviewProfile | null;
  specialKind?: NodeSpecialKind;
  title: string;
  updatedAt: string;
}

export type WorkspaceListNodesById = Record<string, WorkspaceListNode | undefined>;

export function toWorkspaceListNode(node: Node): WorkspaceListNode {
  return {
    anchorLink: node.anchorLink ?? null,
    createdAt: node.createdAt,
    desiredRetention: node.desiredRetention ?? null,
    hasContent: hasNodeContent(node),
    hasReveal: hasNodeReveal(node),
    id: node.id,
    parentNodeId: node.parentNodeId,
    priority: node.priority ?? null,
    reading: node.reading ?? null,
    review: node.review,
    specialKind: node.specialKind,
    title: node.title,
    updatedAt: node.updatedAt
  };
}

export function toWorkspaceListNodesById(
  nodesById: Record<string, Node | undefined>
): WorkspaceListNodesById {
  return Object.fromEntries(
    Object.entries(nodesById).map(([nodeId, node]) => [
      nodeId,
      node ? toWorkspaceListNode(node) : undefined
    ])
  );
}

export type WorkspaceListReviewItemKind = 'none' | 'reading' | 'fsrs';

export function getWorkspaceListReviewItemKind(
  node: WorkspaceListNode | null | undefined
): WorkspaceListReviewItemKind {
  if (!node) {
    return 'none';
  }
  if (node.review) {
    return 'fsrs';
  }
  if (node.anchorLink?.kind === 'cloze') {
    return 'fsrs';
  }
  if (node.hasReveal) {
    return 'fsrs';
  }
  return 'reading';
}

export function isFsrsWorkspaceListNode(node: WorkspaceListNode | null | undefined) {
  return getWorkspaceListReviewItemKind(node) === 'fsrs';
}
