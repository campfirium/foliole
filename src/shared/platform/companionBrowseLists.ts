import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import { normalizeWorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshotContract';
import { resolveNodeOpeningText } from '../../../lib/core/nodes/nodeOpeningPreview';
import { resolveVirtualNodeResultIds } from '../../../lib/core/nodes/virtualNodeResults';
import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';
import { getWorkspaceListNodeAuthor } from '../../features/nodes/model/workspaceListNode';
import {
  isCanonicalTrashedNodeId,
  isCanonicalVisibleNodeId,
  selectCanonicalTrashedNodeIds,
  selectCanonicalVisibleNodeIds
} from '../workspaceCanonicalSelectors';

import { sortCompanionBrowseNodes } from './companionBrowseOrdering';
import { resolveCompanionArticleTitle, resolveCompanionUntitledLabel } from './companionReadableArticle';
import { isCompanionArticleNode } from './companionReadableArticleTitleSlot';

type CompanionReadableNode = WorkspaceSnapshot['nodesById'][string];

export interface CompanionRecentArticle {
  authorLabel?: string | null;
  bodyBlobHash?: string | null;
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  folderLabel?: string | null;
  nodeId: string;
  preview: string | null;
  title: string;
  updatedAt: string;
}

export interface CompanionFolderListEntry {
  bodyBlobHash?: string | null;
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
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

export interface CompanionRootDirectoryView {
  items: CompanionFolderListEntry[];
}

export interface CompanionTrashView {
  items: CompanionFolderListEntry[];
}

function normalizeBodyStatus(status: CompanionReadableNode['bodyStatus']) {
  return status === 'missing' || status === 'empty' || status === 'fetching' || status === 'failed' ? status : undefined;
}

function hasReadableContent(node: CompanionReadableNode | undefined) {
  return Boolean(node && (
    (typeof node.content === 'string' && node.content.trim()) ||
    node.bodyStatus === 'empty' ||
    node.bodyStatus === 'failed' ||
    node.bodyStatus === 'fetching' ||
    node.bodyStatus === 'missing'
  ));
}

function isBrowseContainerNode(node: CompanionReadableNode | undefined): node is CompanionReadableNode {
  return Boolean(node && (node.kind === 'folder' || node.kind === 'topic'));
}

function isTopicContainerNode(node: CompanionReadableNode): node is CompanionReadableNode & { kind: 'topic' } {
  return node.kind === 'topic';
}

function isRootFolderNode(node: CompanionReadableNode | undefined): node is CompanionReadableNode {
  return Boolean(node && node.kind === 'folder' && !node.parentNodeId);
}

function resolveParentFolderLabel(snapshot: WorkspaceSnapshot, node: CompanionReadableNode): string | null {
  if (!node.parentNodeId) return null;
  const parentNode = snapshot.nodesById[node.parentNodeId];
  if (!parentNode || parentNode.kind !== 'folder') return null;
  return parentNode.title.trim() || resolveCompanionUntitledLabel();
}

function buildCompanionFolderListEntry(node: CompanionReadableNode): CompanionFolderListEntry {
  const bodyStatus = normalizeBodyStatus(node.bodyStatus);
  return {
    ...(bodyStatus ? { bodyStatus } : {}),
    bodyBlobHash: node.bodyBlobHash ?? null,
    kind: node.kind,
    nodeId: node.id,
    preview: node.kind === 'folder' ? null : resolveNodeOpeningText(node.content || (node.openingText ?? ''), node.title),
    title: node.kind === 'topic' ? resolveCompanionArticleTitle(node) : node.title.trim() || resolveCompanionUntitledLabel()
  };
}

function isVirtualFolderNode(node: CompanionReadableNode | undefined): node is CompanionReadableNode {
  return Boolean(node && node.kind === 'folder' && node.virtualFilter);
}

function resolveCompanionVirtualFolderItems(snapshot: WorkspaceSnapshot, folderNode: CompanionReadableNode) {
  const resultIds = resolveVirtualNodeResultIds({
    activeNodeId: folderNode.id,
    filter: folderNode.virtualFilter,
    manualChildOrder: folderNode.manualChildOrder,
    nodeOrder: selectCanonicalVisibleNodeIds(snapshot),
    nodesById: snapshot.nodesById
  });
  return resultIds
    .map((nodeId) => snapshot.nodesById[nodeId])
    .filter((node): node is CompanionReadableNode => Boolean(node))
    .map(buildCompanionFolderListEntry);
}

function resolveCompanionDirectFolderView(
  snapshot: WorkspaceSnapshot,
  folderNode: CompanionReadableNode,
  sortKey: FolderListSortKey,
  sortDirection: FolderListSortDirection
) {
  const childNodes = selectCanonicalVisibleNodeIds(snapshot)
    .map((childNodeId) => snapshot.nodesById[childNodeId])
    .filter((childNode): childNode is CompanionReadableNode => Boolean(
      childNode && childNode.parentNodeId === folderNode.id && !childNode.anchorLink
    ));
  if (isTopicContainerNode(folderNode) && childNodes.length === 0) return null;
  return {
    items: sortCompanionBrowseNodes(snapshot, childNodes, sortKey, sortDirection).map(buildCompanionFolderListEntry),
    nodeId: folderNode.id,
    title: folderNode.title.trim() || resolveCompanionUntitledLabel()
  };
}

export function resolveCompanionFolderViewByNodeId(
  snapshot: WorkspaceSnapshot | null,
  nodeId: string | null,
  sortKey: FolderListSortKey = DEFAULT_FOLDER_LIST_SORT_KEY,
  sortDirection: FolderListSortDirection = DEFAULT_FOLDER_LIST_SORT_DIRECTION
): CompanionFolderView | null {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot || !nodeId || !isCanonicalVisibleNodeId(normalizedSnapshot, nodeId)) return null;
  const folderNode = normalizedSnapshot.nodesById[nodeId];
  if (!isBrowseContainerNode(folderNode)) return null;
  if (isVirtualFolderNode(folderNode)) {
    return {
      items: resolveCompanionVirtualFolderItems(normalizedSnapshot, folderNode),
      nodeId: folderNode.id,
      title: folderNode.title.trim() || resolveCompanionUntitledLabel()
    };
  }
  return resolveCompanionDirectFolderView(normalizedSnapshot, folderNode, sortKey, sortDirection);
}

export function resolveCompanionRootDirectoryView(
  snapshot: WorkspaceSnapshot | null,
  sortKey: FolderListSortKey = DEFAULT_FOLDER_LIST_SORT_KEY,
  sortDirection: FolderListSortDirection = DEFAULT_FOLDER_LIST_SORT_DIRECTION
): CompanionRootDirectoryView {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot) return { items: [] };
  const rootNodes = selectCanonicalVisibleNodeIds(normalizedSnapshot)
    .map((nodeId) => normalizedSnapshot.nodesById[nodeId])
    .filter((node): node is CompanionReadableNode => isRootFolderNode(node));
  void sortKey;
  void sortDirection;
  return { items: rootNodes.map(buildCompanionFolderListEntry) };
}

export function resolveCompanionTrashView(
  snapshot: WorkspaceSnapshot | null,
  sortKey: FolderListSortKey = DEFAULT_FOLDER_LIST_SORT_KEY,
  sortDirection: FolderListSortDirection = DEFAULT_FOLDER_LIST_SORT_DIRECTION
): CompanionTrashView {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot) return { items: [] };
  const trashNodes = selectCanonicalTrashedNodeIds(normalizedSnapshot)
    .map((nodeId) => normalizedSnapshot.nodesById[nodeId])
    .filter((node): node is CompanionReadableNode => Boolean(node));
  return { items: sortCompanionBrowseNodes(normalizedSnapshot, trashNodes, sortKey, sortDirection).map(buildCompanionFolderListEntry) };
}

export function resolveCompanionTrashFolderViewByNodeId(
  snapshot: WorkspaceSnapshot | null,
  nodeId: string | null,
  sortKey: FolderListSortKey = DEFAULT_FOLDER_LIST_SORT_KEY,
  sortDirection: FolderListSortDirection = DEFAULT_FOLDER_LIST_SORT_DIRECTION
): CompanionFolderView | null {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot || !nodeId || !isCanonicalTrashedNodeId(normalizedSnapshot, nodeId)) return null;
  const folderNode = normalizedSnapshot.nodesById[nodeId];
  if (!isBrowseContainerNode(folderNode)) return null;
  const childNodes = selectCanonicalTrashedNodeIds(normalizedSnapshot)
    .map((childNodeId) => normalizedSnapshot.nodesById[childNodeId])
    .filter((childNode): childNode is CompanionReadableNode => Boolean(
      childNode && childNode.parentNodeId === nodeId && !childNode.anchorLink
    ));
  if (folderNode.kind === 'topic' && childNodes.length === 0) return null;
  return {
    items: sortCompanionBrowseNodes(normalizedSnapshot, childNodes, sortKey, sortDirection).map(buildCompanionFolderListEntry),
    nodeId: folderNode.id,
    title: folderNode.title.trim() || resolveCompanionUntitledLabel()
  };
}

export function resolveCompanionRecentArticles(
  snapshot: WorkspaceSnapshot | null,
  sortKey: FolderListSortKey = DEFAULT_FOLDER_LIST_SORT_KEY,
  sortDirection: FolderListSortDirection = DEFAULT_FOLDER_LIST_SORT_DIRECTION
): CompanionRecentArticle[] {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot) return [];
  const articles = selectCanonicalVisibleNodeIds(normalizedSnapshot)
    .map((nodeId) => normalizedSnapshot.nodesById[nodeId])
    .filter((node): node is CompanionReadableNode => Boolean(node && isCompanionArticleNode(normalizedSnapshot, node)))
    .filter(hasReadableContent);
  return sortCompanionBrowseNodes(normalizedSnapshot, articles, sortKey, sortDirection).map((node) => {
    const bodyStatus = normalizeBodyStatus(node.bodyStatus);
    const readableText = node.content || (node.openingText ?? '');
    return {
      nodeId: node.id,
      authorLabel: getWorkspaceListNodeAuthor(node),
      bodyBlobHash: node.bodyBlobHash ?? null,
      folderLabel: resolveParentFolderLabel(normalizedSnapshot, node),
      preview: resolveNodeOpeningText(readableText, node.title),
      ...(bodyStatus ? { bodyStatus } : {}),
      title: resolveCompanionArticleTitle(node),
      updatedAt: node.updatedAt
    };
  });
}
