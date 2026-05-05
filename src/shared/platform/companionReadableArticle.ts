import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import { resolveNodeOpeningText } from '../../../lib/core/nodes/nodeOpeningPreview';
import { extractImportedHeadingTitle } from '../lib/importedHeadingTitle';

export interface CompanionReadableArticle {
  content: string;
  hideTitleHeading: boolean;
  nodeId: string;
  title: string;
}

export interface CompanionRecentArticle {
  nodeId: string;
  preview: string | null;
  title: string;
  updatedAt: string;
}

export interface CompanionFolderListEntry {
  kind: CompanionReadableNode['kind'];
  nodeId: string;
  preview: string | null;
  title: string;
}

export interface CompanionFolderView {
  items: CompanionFolderListEntry[];
  nodeId: string;
  title: string;
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
    hideTitleHeading: Boolean(node.hideTitleHeading),
    nodeId: node.id,
    title: resolveCompanionArticleTitle(node)
  };
}

function buildCompanionFolderListEntry(node: CompanionReadableNode): CompanionFolderListEntry {
  return {
    kind: node.kind,
    nodeId: node.id,
    preview: node.kind === 'folder' ? null : resolveNodeOpeningText(node.content, node.title),
    title: node.kind === 'topic' ? resolveCompanionArticleTitle(node) : node.title.trim() || 'Untitled'
  };
}

function isActiveFolderNode(node: CompanionReadableNode | undefined) {
  return Boolean(node && node.kind === 'folder');
}

export function resolveCompanionArticleTitle(node: CompanionReadableNode) {
  const headingTitle = extractImportedHeadingTitle(node.content);
  if (headingTitle) {
    return headingTitle;
  }
  return node.title.trim() || 'Untitled';
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

export function resolveCompanionFolderViewByNodeId(
  snapshot: WorkspaceSnapshot | null,
  nodeId: string | null
): CompanionFolderView | null {
  if (!snapshot || !nodeId || snapshot.trashedNodeIds.includes(nodeId)) {
    return null;
  }

  const folderNode = snapshot.nodesById[nodeId];
  if (!isActiveFolderNode(folderNode)) {
    return null;
  }

  return {
    items: snapshot.nodeOrder
      .filter((childNodeId) => !snapshot.trashedNodeIds.includes(childNodeId))
      .map((childNodeId) => snapshot.nodesById[childNodeId])
      .filter((childNode): childNode is CompanionReadableNode => Boolean(childNode && childNode.parentNodeId === nodeId))
      .map(buildCompanionFolderListEntry),
    nodeId: folderNode.id,
    title: folderNode.title.trim() || 'Untitled'
  };
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
      title: resolveCompanionArticleTitle(node),
      updatedAt: node.updatedAt
    }));
}
