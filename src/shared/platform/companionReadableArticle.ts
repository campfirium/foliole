import type { WorkspaceSnapshot } from '../../../lib/core/database/workspaceSnapshot';
import {
  listVisibleWorkspaceSnapshotNodeIds,
  normalizeWorkspaceSnapshot
} from '../../../lib/core/database/workspaceSnapshotContract';
import type { PersistedNodeViewState } from '../../../lib/platform/persistedNodeViewState';
import type { EditorTextAnchorDecoration } from '../../features/editor/adapters/EditorAdapter';
import { collectDocumentTextAnchorDecorations } from '../../features/editor/model/documentTextAnchorDecorations';
import { extractImportedHeadingTitle } from '../lib/importedHeadingTitle';

import { resolveCompanionArticleContentPaddingTop } from './companionReadableArticleTitleSlot';
export type {
  CompanionFolderListEntry,
  CompanionFolderView,
  CompanionRecentArticle,
  CompanionRootDirectoryView
} from './companionBrowseLists';

export interface CompanionReadableArticle {
  bodyBlobHash?: string | null;
  bodyStatus?: 'empty' | 'failed' | 'fetching' | 'missing' | 'ready';
  content: string;
  contentPaddingTop?: string;
  hideTitleHeading: boolean;
  isTrashed?: boolean;
  nodeId: string;
  persistedNodeViewState: PersistedNodeViewState | null;
  pdfAttachmentId: string | null;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  title: string;
}

type CompanionReadableNode = WorkspaceSnapshot['nodesById'][string];

function hasReadableContent(node: CompanionReadableNode | undefined): node is CompanionReadableNode {
  return Boolean(node && (
    (typeof node.content === 'string' && node.content.trim()) ||
    node.bodyStatus === 'empty' ||
    node.bodyStatus === 'failed' ||
    node.bodyStatus === 'fetching' ||
    node.bodyStatus === 'missing'
  ));
}

function buildReadableArticle(node: CompanionReadableNode, persistedNodeViewState: PersistedNodeViewState | null) {
  return {
    bodyStatus: normalizeBodyStatus(node.bodyStatus) ?? 'ready' as const,
    bodyBlobHash: node.bodyBlobHash ?? null,
    content: node.content,
    hideTitleHeading: Boolean(node.hideTitleHeading),
    nodeId: node.id,
    persistedNodeViewState,
    pdfAttachmentId: resolveReferencePdfAttachmentId(node),
    textAnchorDecorations: [],
    title: resolveCompanionArticleTitle(node)
  };
}

function resolveReferencePdfAttachmentId(node: CompanionReadableNode) {
  return node.attachments?.find((attachment) => attachment.role === 'reference' && attachment.mimeType === 'application/pdf')?.attachmentId ?? null;
}

function buildReadableArticleFromSnapshot(snapshot: WorkspaceSnapshot, node: CompanionReadableNode, isTrashed = false) {
  const contentPaddingTop = resolveCompanionArticleContentPaddingTop(snapshot, node);
  return {
    ...buildReadableArticle(node, snapshot.persistedNodeViewById?.[node.id] ?? null),
    ...(contentPaddingTop ? { contentPaddingTop } : {}),
    ...(isTrashed ? { isTrashed } : {}),
    textAnchorDecorations: collectDocumentTextAnchorDecorations({
      activeNodeId: node.id,
      nodesById: snapshot.nodesById,
      parentContent: node.content,
      trashedNodeIds: snapshot.trashedNodeIds
    })
  };
}

function normalizeBodyStatus(status: CompanionReadableNode['bodyStatus']) {
  return status === 'missing' || status === 'empty' || status === 'fetching' || status === 'failed' ? status : undefined;
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
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot || !nodeId || normalizedSnapshot.trashedNodeIds.includes(nodeId)) {
    return null;
  }
  const node = normalizedSnapshot.nodesById[nodeId];
  return node && hasReadableContent(node) ? buildReadableArticleFromSnapshot(normalizedSnapshot, node) : null;
}

export function resolveReadableCompanionTrashArticleByNodeId(
  snapshot: WorkspaceSnapshot | null,
  nodeId: string | null
): CompanionReadableArticle | null {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot || !nodeId || !normalizedSnapshot.trashedNodeIds.includes(nodeId)) {
    return null;
  }
  const node = normalizedSnapshot.nodesById[nodeId];
  return node && hasReadableContent(node) ? buildReadableArticleFromSnapshot(normalizedSnapshot, node, true) : null;
}

export function resolveReadableCompanionArticle(snapshot: WorkspaceSnapshot | null): CompanionReadableArticle | null {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot) {
    return null;
  }

  const activeReadableArticle = resolveReadableCompanionArticleByNodeId(normalizedSnapshot, normalizedSnapshot.activeNodeId);
  if (activeReadableArticle) {
    return activeReadableArticle;
  }

  for (const nodeId of listVisibleWorkspaceSnapshotNodeIds(normalizedSnapshot)) {
    const node = normalizedSnapshot.nodesById[nodeId];
    if (!hasReadableContent(node)) {
      continue;
    }
    return buildReadableArticleFromSnapshot(normalizedSnapshot, node);
  }

  return null;
}

export function resolveCompanionBrowseExitNodeId(snapshot: WorkspaceSnapshot | null, nodeId: string | null) {
  const normalizedSnapshot = snapshot ? normalizeWorkspaceSnapshot(snapshot) : null;
  if (!normalizedSnapshot || !nodeId || normalizedSnapshot.trashedNodeIds.includes(nodeId)) {
    return null;
  }
  const node = normalizedSnapshot.nodesById[nodeId];
  const parentNodeId = node?.parentNodeId ?? null;
  if (!parentNodeId || normalizedSnapshot.trashedNodeIds.includes(parentNodeId)) {
    return null;
  }
  return normalizedSnapshot.nodesById[parentNodeId]?.kind === 'folder' ? parentNodeId : null;
}
