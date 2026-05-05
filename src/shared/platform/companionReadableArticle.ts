import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import { resolveNodeOpeningText } from '../../../lib/core/nodes/nodeOpeningPreview';

export interface CompanionReadableArticle {
  content: string;
  nodeId: string;
  title: string;
}

export interface CompanionRecentArticle {
  nodeId: string;
  preview: string | null;
  title: string;
  updatedAt: string;
}

type CompanionReadableNode = WorkspaceSnapshot['nodesById'][string];

function hasReadableContent(node: CompanionReadableNode | undefined) {
  return Boolean(node && typeof node.content === 'string' && node.content.trim());
}

function isArticleNode(snapshot: WorkspaceSnapshot, node: CompanionReadableNode | undefined) {
  if (!node || node.kind !== 'topic') {
    return false;
  }

  let parentNodeId = node.parentNodeId;
  while (parentNodeId) {
    const parentNode = snapshot.nodesById[parentNodeId];
    if (!parentNode || parentNode.kind !== 'folder') {
      return false;
    }
    parentNodeId = parentNode.parentNodeId;
  }

  return true;
}

function buildReadableArticle(node: CompanionReadableNode) {
  return {
    content: node.content,
    nodeId: node.id,
    title: node.title.trim() || 'Untitled'
  };
}

export function resolveReadableCompanionArticleByNodeId(
  snapshot: WorkspaceSnapshot | null,
  nodeId: string | null
): CompanionReadableArticle | null {
  if (!snapshot || !nodeId || snapshot.trashedNodeIds.includes(nodeId)) {
    return null;
  }
  const node = snapshot.nodesById[nodeId];
  return hasReadableContent(node) ? buildReadableArticle(node) : null;
}

export function resolveReadableCompanionArticle(snapshot: WorkspaceSnapshot | null): CompanionReadableArticle | null {
  if (!snapshot) {
    return null;
  }

  const activeReadableArticle = resolveReadableCompanionArticleByNodeId(snapshot, snapshot.activeNodeId);
  if (activeReadableArticle) {
    return activeReadableArticle;
  }

  for (const nodeId of snapshot.nodeOrder) {
    if (snapshot.trashedNodeIds.includes(nodeId)) {
      continue;
    }
    const node = snapshot.nodesById[nodeId];
    if (!hasReadableContent(node)) {
      continue;
    }
    return buildReadableArticle(node);
  }

  return null;
}

export function resolveCompanionRecentArticles(snapshot: WorkspaceSnapshot | null): CompanionRecentArticle[] {
  if (!snapshot) {
    return [];
  }

  const orderIndexByNodeId = new Map(snapshot.nodeOrder.map((nodeId, index) => [nodeId, index]));

  return snapshot.nodeOrder
    .filter((nodeId) => !snapshot.trashedNodeIds.includes(nodeId))
    .map((nodeId) => snapshot.nodesById[nodeId])
    .filter((node) => isArticleNode(snapshot, node))
    .filter(hasReadableContent)
    .sort((left, right) => {
      const updatedAtCompare = right.updatedAt.localeCompare(left.updatedAt);
      if (updatedAtCompare !== 0) {
        return updatedAtCompare;
      }
      const createdAtCompare = right.createdAt.localeCompare(left.createdAt);
      if (createdAtCompare !== 0) {
        return createdAtCompare;
      }
      return (orderIndexByNodeId.get(left.id) ?? 0) - (orderIndexByNodeId.get(right.id) ?? 0);
    })
    .map((node) => ({
      nodeId: node.id,
      preview: resolveNodeOpeningText(node.content, node.title),
      title: node.title.trim() || 'Untitled',
      updatedAt: node.updatedAt
    }));
}
