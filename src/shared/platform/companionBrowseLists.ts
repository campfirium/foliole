import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import { resolveNodeOpeningText } from '../../../lib/core/nodes/nodeOpeningPreview';
import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../../features/nodes/model/folderListOrdering';

import { sortCompanionBrowseNodes } from './companionBrowseOrdering';
import { resolveCompanionArticleTitle } from './companionReadableArticle';
import { isCompanionArticleNode } from './companionReadableArticleTitleSlot';

type CompanionReadableNode = WorkspaceSnapshot['nodesById'][string];

export interface CompanionRecentArticle {
  bodyBlobHash?: string | null;
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
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

function isActiveFolderNode(node: CompanionReadableNode | undefined) {
  return Boolean(node && node.kind === 'folder');
}

function isRootFolderNode(node: CompanionReadableNode | undefined) {
  return Boolean(node && node.kind === 'folder' && !node.parentNodeId);
}

function buildCompanionFolderListEntry(node: CompanionReadableNode): CompanionFolderListEntry {
  return {
    bodyStatus: normalizeBodyStatus(node.bodyStatus),
    bodyBlobHash: node.bodyBlobHash ?? null,
    kind: node.kind,
    nodeId: node.id,
    preview: node.kind === 'folder' ? null : resolveNodeOpeningText(node.content || (node.openingText ?? ''), node.title),
    title: node.kind === 'topic' ? resolveCompanionArticleTitle(node) : node.title.trim() || 'Untitled'
  };
}

export function resolveCompanionFolderViewByNodeId(
  snapshot: WorkspaceSnapshot | null,
  nodeId: string | null,
  sortKey: FolderListSortKey = DEFAULT_FOLDER_LIST_SORT_KEY,
  sortDirection: FolderListSortDirection = DEFAULT_FOLDER_LIST_SORT_DIRECTION
): CompanionFolderView | null {
  if (!snapshot || !nodeId || snapshot.trashedNodeIds.includes(nodeId)) return null;
  const folderNode = snapshot.nodesById[nodeId];
  if (!isActiveFolderNode(folderNode)) return null;
  const childNodes = snapshot.nodeOrder
    .filter((childNodeId) => !snapshot.trashedNodeIds.includes(childNodeId))
    .map((childNodeId) => snapshot.nodesById[childNodeId])
    .filter((childNode): childNode is CompanionReadableNode => Boolean(childNode && childNode.parentNodeId === nodeId));
  return {
    items: sortCompanionBrowseNodes(snapshot, childNodes, sortKey, sortDirection).map(buildCompanionFolderListEntry),
    nodeId: folderNode.id,
    title: folderNode.title.trim() || 'Untitled'
  };
}

export function resolveCompanionRootDirectoryView(
  snapshot: WorkspaceSnapshot | null,
  sortKey: FolderListSortKey = DEFAULT_FOLDER_LIST_SORT_KEY,
  sortDirection: FolderListSortDirection = DEFAULT_FOLDER_LIST_SORT_DIRECTION
): CompanionRootDirectoryView {
  if (!snapshot) return { items: [] };
  const rootNodes = snapshot.nodeOrder
    .filter((nodeId) => !snapshot.trashedNodeIds.includes(nodeId))
    .map((nodeId) => snapshot.nodesById[nodeId])
    .filter((node): node is CompanionReadableNode => isRootFolderNode(node));
  return { items: sortCompanionBrowseNodes(snapshot, rootNodes, sortKey, sortDirection).map(buildCompanionFolderListEntry) };
}

export function resolveCompanionTrashView(
  snapshot: WorkspaceSnapshot | null,
  sortKey: FolderListSortKey = DEFAULT_FOLDER_LIST_SORT_KEY,
  sortDirection: FolderListSortDirection = DEFAULT_FOLDER_LIST_SORT_DIRECTION
): CompanionTrashView {
  if (!snapshot) return { items: [] };
  const trashedNodeIds = new Set(snapshot.trashedNodeIds);
  const trashNodes = snapshot.nodeOrder
    .filter((nodeId) => trashedNodeIds.has(nodeId))
    .map((nodeId) => snapshot.nodesById[nodeId])
    .filter((node): node is CompanionReadableNode => Boolean(node));
  return { items: sortCompanionBrowseNodes(snapshot, trashNodes, sortKey, sortDirection).map(buildCompanionFolderListEntry) };
}

export function resolveCompanionTrashFolderViewByNodeId(
  snapshot: WorkspaceSnapshot | null,
  nodeId: string | null,
  sortKey: FolderListSortKey = DEFAULT_FOLDER_LIST_SORT_KEY,
  sortDirection: FolderListSortDirection = DEFAULT_FOLDER_LIST_SORT_DIRECTION
): CompanionFolderView | null {
  if (!snapshot || !nodeId || !snapshot.trashedNodeIds.includes(nodeId)) return null;
  const folderNode = snapshot.nodesById[nodeId];
  if (!isActiveFolderNode(folderNode)) return null;
  const trashedNodeIds = new Set(snapshot.trashedNodeIds);
  const childNodes = snapshot.nodeOrder
    .filter((childNodeId) => trashedNodeIds.has(childNodeId))
    .map((childNodeId) => snapshot.nodesById[childNodeId])
    .filter((childNode): childNode is CompanionReadableNode => Boolean(childNode && childNode.parentNodeId === nodeId));
  return {
    items: sortCompanionBrowseNodes(snapshot, childNodes, sortKey, sortDirection).map(buildCompanionFolderListEntry),
    nodeId: folderNode.id,
    title: folderNode.title.trim() || 'Untitled'
  };
}

export function resolveCompanionRecentArticles(
  snapshot: WorkspaceSnapshot | null,
  sortKey: FolderListSortKey = DEFAULT_FOLDER_LIST_SORT_KEY,
  sortDirection: FolderListSortDirection = DEFAULT_FOLDER_LIST_SORT_DIRECTION
): CompanionRecentArticle[] {
  if (!snapshot) return [];
  const articles = snapshot.nodeOrder
    .filter((nodeId) => !snapshot.trashedNodeIds.includes(nodeId))
    .map((nodeId) => snapshot.nodesById[nodeId])
    .filter((node) => isCompanionArticleNode(snapshot, node))
    .filter(hasReadableContent);
  return sortCompanionBrowseNodes(snapshot, articles, sortKey, sortDirection).map((node) => ({
    nodeId: node.id,
    bodyBlobHash: node.bodyBlobHash ?? null,
    preview: resolveNodeOpeningText(node.content || (node.openingText ?? ''), node.title),
    bodyStatus: normalizeBodyStatus(node.bodyStatus),
    title: resolveCompanionArticleTitle(node),
    updatedAt: node.updatedAt
  }));
}
