import path from 'node:path';

import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';

const INBOX_NODE_ID = 'special-inbox';

type ArticleNode = WorkspaceSnapshot['nodesById'][string];

function resolveFolderDirectory(
  folderId: string,
  snapshot: WorkspaceSnapshot,
  mirrorRoot: string,
  resolvedFolderDirectories: Map<string, string>,
  usedDirectoryNamesByParent: Map<string, Set<string>>,
  createStableDirectoryName: (title: string, nodeId: string, usedNames: Set<string>) => string
): string {
  const cached = resolvedFolderDirectories.get(folderId);
  if (cached) {
    return cached;
  }

  if (folderId === INBOX_NODE_ID) {
    const inboxDirectory = path.join(mirrorRoot, 'Inbox');
    resolvedFolderDirectories.set(folderId, inboxDirectory);
    return inboxDirectory;
  }

  const folder = snapshot.nodesById[folderId];
  if (!folder || folder.kind !== 'folder') {
    return mirrorRoot;
  }

  const parentDirectory = resolveAncestorDirectory(
    folder.parentNodeId,
    snapshot,
    mirrorRoot,
    resolvedFolderDirectories,
    usedDirectoryNamesByParent,
    createStableDirectoryName
  );

  const usedNames = usedDirectoryNamesByParent.get(parentDirectory) ?? new Set<string>();
  usedDirectoryNamesByParent.set(parentDirectory, usedNames);
  const directoryName = createStableDirectoryName(folder.title.trim() || 'Untitled', folder.id, usedNames);
  const directoryPath = path.join(parentDirectory, directoryName);
  resolvedFolderDirectories.set(folderId, directoryPath);
  return directoryPath;
}

function resolveAncestorDirectory(
  nodeId: string | null,
  snapshot: WorkspaceSnapshot,
  mirrorRoot: string,
  resolvedFolderDirectories: Map<string, string>,
  usedDirectoryNamesByParent: Map<string, Set<string>>,
  createStableDirectoryName: (title: string, nodeId: string, usedNames: Set<string>) => string
): string {
  if (!nodeId) {
    return mirrorRoot;
  }
  if (nodeId === INBOX_NODE_ID) {
    return path.join(mirrorRoot, 'Inbox');
  }

  const node = snapshot.nodesById[nodeId];
  if (!node) {
    return mirrorRoot;
  }
  if (snapshot.trashedNodeIds.includes(node.id)) {
    return path.join(mirrorRoot, 'Trash');
  }
  if (node.kind === 'folder') {
    return resolveFolderDirectory(
      node.id,
      snapshot,
      mirrorRoot,
      resolvedFolderDirectories,
      usedDirectoryNamesByParent,
      createStableDirectoryName
    );
  }
  return resolveAncestorDirectory(
    node.parentNodeId,
    snapshot,
    mirrorRoot,
    resolvedFolderDirectories,
    usedDirectoryNamesByParent,
    createStableDirectoryName
  );
}

export function resolveArticleDirectory(
  article: ArticleNode,
  snapshot: WorkspaceSnapshot,
  mirrorRoot: string,
  resolvedFolderDirectories: Map<string, string>,
  usedDirectoryNamesByParent: Map<string, Set<string>>,
  createStableDirectoryName: (title: string, nodeId: string, usedNames: Set<string>) => string
) {
  return resolveAncestorDirectory(
    article.parentNodeId,
    snapshot,
    mirrorRoot,
    resolvedFolderDirectories,
    usedDirectoryNamesByParent,
    createStableDirectoryName
  );
}

export function createRootReservedDirectoryNames(mirrorRoot: string) {
  return new Map<string, Set<string>>([[mirrorRoot, new Set<string>(['Inbox', 'Trash'])]]);
}
