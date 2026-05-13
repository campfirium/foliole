import type { NodeKind } from '../../../../lib/core/nodes/nodeKind';

import type {
  Node,
  NodeAnchorLink,
  NodeReadingProfile,
  NodeReviewProfile,
  NodeSpecialKind
} from './nodeTypes';
import { hasNodeContent, hasNodeReveal } from './nodeTypes';
export {
  compareWorkspaceListNodeDateDesc,
  getWorkspaceListNodeAuthor,
  getWorkspaceListNodeDateLabel,
  getWorkspaceListNodeLastOpenedLabel,
  getWorkspaceListNodeOpening,
  getWorkspaceListNodeSummary,
  WORKSPACE_LIST_DATE_FALLBACK,
  WORKSPACE_LIST_LAST_OPENED_FALLBACK,
  WORKSPACE_LIST_OPENING_FALLBACK,
  WORKSPACE_LIST_SUMMARY_FALLBACK
} from './workspaceListNodeMetadata';

export interface WorkspaceListNode {
  anchorLink?: NodeAnchorLink | null;
  createdAt: string;
  desiredRetention?: number | null;
  hasContent: boolean;
  hasReveal: boolean;
  id: string;
  kind?: NodeKind;
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
    kind: node.kind,
    parentNodeId: node.parentNodeId,
    priority: node.priority ?? null,
    reading: node.reading ?? null,
    review: node.review,
    ...(node.specialKind ? { specialKind: node.specialKind } : {}),
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

function isWorkspaceListProjectionReusable(
  projectedNode: WorkspaceListNode | undefined,
  sourceNode: Node | undefined
) {
  if (!projectedNode || !sourceNode) {
    return projectedNode === undefined && sourceNode === undefined;
  }

  return (
    projectedNode.anchorLink === (sourceNode.anchorLink ?? null) &&
    projectedNode.createdAt === sourceNode.createdAt &&
    projectedNode.desiredRetention === (sourceNode.desiredRetention ?? null) &&
    projectedNode.hasContent === hasNodeContent(sourceNode) &&
    projectedNode.hasReveal === hasNodeReveal(sourceNode) &&
    projectedNode.id === sourceNode.id &&
    projectedNode.kind === sourceNode.kind &&
    projectedNode.parentNodeId === sourceNode.parentNodeId &&
    projectedNode.priority === (sourceNode.priority ?? null) &&
    projectedNode.reading === (sourceNode.reading ?? null) &&
    projectedNode.review === sourceNode.review &&
    projectedNode.specialKind === sourceNode.specialKind &&
    projectedNode.title === sourceNode.title &&
    projectedNode.updatedAt === sourceNode.updatedAt
  );
}

export function projectWorkspaceListNodesById(
  nodesById: Record<string, Node | undefined>,
  previousProjection?: WorkspaceListNodesById
): WorkspaceListNodesById {
  const previous = previousProjection ?? {};
  let changed = Object.keys(previous).length !== Object.keys(nodesById).length;
  const nextProjection: WorkspaceListNodesById = {};

  for (const [nodeId, node] of Object.entries(nodesById)) {
    const previousNode = previous[nodeId];
    if (isWorkspaceListProjectionReusable(previousNode, node)) {
      nextProjection[nodeId] = previousNode;
      continue;
    }

    nextProjection[nodeId] = node ? toWorkspaceListNode(node) : undefined;
    changed = true;
  }

  return changed ? nextProjection : previous;
}

export type WorkspaceListReviewItemKind = 'none' | 'reading' | 'fsrs';

function resolveFormalReviewItemKind(kind: NodeKind | null | undefined): WorkspaceListReviewItemKind | null {
  if (kind === 'folder') {
    return 'none';
  }
  if (kind === 'topic') {
    return 'reading';
  }
  if (kind === 'item') {
    return 'fsrs';
  }
  return null;
}

export function getWorkspaceListReviewItemKind(
  node: WorkspaceListNode | null | undefined
): WorkspaceListReviewItemKind {
  if (!node) {
    return 'none';
  }
  const formalReviewItemKind = resolveFormalReviewItemKind(node.kind);
  if (formalReviewItemKind) {
    return formalReviewItemKind;
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
