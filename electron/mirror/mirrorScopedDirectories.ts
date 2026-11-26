import path from 'node:path';

import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { sanitizeArticleTitle } from './articleMirrorPlanning.js';
import { mirrorPathKey } from './mirrorPathIdentity.js';
import { MIRROR_INBOX_NODE_ID, type ScopedMirrorNode } from './mirrorScopedTree.js';

type MirrorNode = WorkspaceSnapshot['nodesById'][string];

export interface ScopedArticleLocation {
  /** The node whose direct contents share the article's directory; `null` is the library root. */
  anchorId: string | null;
  /** Folders from the root (or Inbox) down to the anchor. */
  folders: MirrorNode[];
  inInbox: boolean;
}

function folderBaseName(folder: MirrorNode) {
  return sanitizeArticleTitle(folder.title.trim() || 'Untitled');
}

function folderSuffix(folderId: string) {
  return folderId.replace(/^node-/, '').slice(0, 8) || folderId.slice(-8);
}

/** Whether `folder` could ever be given the directory name whose key is `key`, whatever order claims run in. */
export function folderCouldClaimName(folder: MirrorNode, key: string) {
  const base = folderBaseName(folder);
  return mirrorPathKey(base) === key || key.startsWith(mirrorPathKey(`${base}--`));
}

/** Whether a name this folder could be given might equal an article file name, which always ends in `.md`. */
export function folderCouldClaimFileName(folder: MirrorNode) {
  const base = folderBaseName(folder);
  return mirrorPathKey(base).endsWith('.md') || mirrorPathKey(`${base}--${folderSuffix(folder.id)}`).endsWith('.md');
}

/**
 * Follows the planner's directory rule for one article chain (nearest first). Returns null for anything the
 * scoped planner does not decide on its own: a trashed article or ancestor, or a folder below a non-folder.
 */
export function locateScopedArticle(chain: ScopedMirrorNode[]): ScopedArticleLocation | null {
  const [article, ...ancestors] = chain;
  if (!article || article.trashed) return null;
  const folders: MirrorNode[] = [];
  let parentId = article.node.parentNodeId;
  for (const entry of ancestors) {
    if (parentId === null || parentId === MIRROR_INBOX_NODE_ID) break;
    if (entry.node.id !== parentId || entry.trashed) return null;
    if (entry.node.kind === 'folder') folders.push(entry.node);
    else if (folders.length > 0) return null;
    parentId = entry.node.parentNodeId;
  }
  if (parentId !== null && parentId !== MIRROR_INBOX_NODE_ID) return null;
  folders.reverse();
  const inInbox = parentId === MIRROR_INBOX_NODE_ID;
  return { anchorId: folders.at(-1)?.id ?? (inInbox ? MIRROR_INBOX_NODE_ID : null), folders, inInbox };
}

/** Parents whose child folders compete with the location's folders for directory names. */
export function locationNamingParents(location: ScopedArticleLocation) {
  const first = location.inInbox ? MIRROR_INBOX_NODE_ID : null;
  return [first, ...location.folders.slice(0, -1).map((folder) => folder.id)];
}

/**
 * The location's directory when every folder on the way keeps its plain name. Null when a sibling folder or a
 * reserved root name could take that name, since the full planner would then resolve it by library order.
 */
export function resolveScopedDirectory(
  location: ScopedArticleLocation,
  mirrorRoot: string,
  childFoldersByParent: Map<string | null, MirrorNode[]>
) {
  let directory = location.inInbox ? path.join(mirrorRoot, 'Inbox') : mirrorRoot;
  let parentId: string | null = location.inInbox ? MIRROR_INBOX_NODE_ID : null;
  for (const folder of location.folders) {
    const name = folderBaseName(folder);
    const key = mirrorPathKey(name);
    if (parentId === null && (key === 'inbox' || key === 'trash')) return null;
    const rivals = (childFoldersByParent.get(parentId) ?? [])
      .filter((sibling) => sibling.id !== folder.id && !(parentId === null && sibling.id === MIRROR_INBOX_NODE_ID));
    if (rivals.some((sibling) => folderCouldClaimName(sibling, key))) return null;
    directory = path.join(directory, name);
    parentId = folder.id;
  }
  return directory;
}
