import path from 'node:path';

import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import {
  type ArticleMirrorPlan,
  collectDerivedDescendants,
  collectDerivedNodeIdsByParent,
  createStableFileName,
  resolveSourceUpdatedAt
} from './articleMirrorPlanning.js';
import { collectArticleData } from './articleMirrorTree.js';
import {
  folderCouldClaimFileName,
  locateScopedArticle,
  locationNamingParents,
  resolveScopedDirectory,
  type ScopedArticleLocation
} from './mirrorScopedDirectories.js';
import { orderScopedNodes } from './mirrorScopedOrder.js';
import {
  hasFolderBelowNonFolder,
  loadMirrorAncestorChain,
  loadMirrorChildFolders,
  loadMirrorDirectoryMembers,
  MIRROR_INBOX_NODE_ID,
  type ScopedMirrorNode
} from './mirrorScopedTree.js';

type MirrorNode = WorkspaceSnapshot['nodesById'][string];

interface ScopedDirectory {
  anchorId: string | null;
  directory: string;
  /** Folders inside the directory, which share its name space with the article files. */
  folders: MirrorNode[];
  /** Nodes that the full planner places in this directory (trashed branches excluded). */
  members: Set<string>;
}

export interface ScopedMirrorPlanning {
  /** Complete plans for the selected articles and path-only plans for every other article in their directories. */
  plans: ArticleMirrorPlan[];
  /** Folders inside each selected article's directory, keyed by article id. */
  directoryFoldersByArticleId: Map<string, MirrorNode[]>;
  snapshot: WorkspaceSnapshot;
}

function buildPartialSnapshot(entries: ScopedMirrorNode[]): WorkspaceSnapshot {
  // Insert in table order so same-parent children enumerate as the full snapshot does.
  const unique = new Map(entries.map((entry) => [entry.node.id, entry]));
  const ordered = [...unique.values()].sort((left, right) => left.rowOrder - right.rowOrder);
  const nodesById: WorkspaceSnapshot['nodesById'] = {};
  for (const entry of ordered) nodesById[entry.node.id] = entry.node;
  return { activeNodeId: null, nodeOrder: [], nodesById, trashedNodeIds: ordered.filter((entry) => entry.trashed)
    .map((entry) => entry.node.id), untitledSequenceByParent: {} };
}

function collectDirectoryMembers(anchorId: string | null, entries: ScopedMirrorNode[]) {
  const childrenByParent = new Map<string | null, ScopedMirrorNode[]>();
  for (const entry of entries) {
    const children = childrenByParent.get(entry.node.parentNodeId) ?? [];
    children.push(entry);
    childrenByParent.set(entry.node.parentNodeId, children);
  }
  const members = new Set<string>();
  const folders: MirrorNode[] = [];
  const pending: Array<string | null> = [anchorId];
  while (pending.length > 0) {
    for (const child of childrenByParent.get(pending.pop()!) ?? []) {
      if (child.node.id === MIRROR_INBOX_NODE_ID || child.trashed && child.node.kind !== 'folder') continue;
      if (child.node.kind === 'folder') {
        folders.push(child.node);
        continue;
      }
      members.add(child.node.id);
      pending.push(child.node.id);
    }
  }
  return { folders, members };
}

function loadLocations(articleIds: string[]) {
  const chains: ScopedMirrorNode[] = [];
  const locations = new Map<string, ScopedArticleLocation>();
  for (const articleId of articleIds) {
    const chain = loadMirrorAncestorChain(articleId);
    const location = chain ? locateScopedArticle(chain) : null;
    if (!chain || !location) return null;
    chains.push(...chain);
    locations.set(articleId, location);
  }
  return { chains, locations };
}

function resolveDirectories(locations: Map<string, ScopedArticleLocation>, mirrorRoot: string, entries: ScopedMirrorNode[]) {
  const rivals = loadMirrorChildFolders([...new Set([...locations.values()].flatMap(locationNamingParents))]);
  entries.push(...rivals);
  const rivalsByParent = new Map<string | null, MirrorNode[]>();
  for (const { node } of rivals) rivalsByParent.set(node.parentNodeId, [...rivalsByParent.get(node.parentNodeId) ?? [], node]);
  const directories = new Map<string | null, ScopedDirectory>();
  for (const location of locations.values()) {
    if (directories.has(location.anchorId)) continue;
    const directory = resolveScopedDirectory(location, mirrorRoot, rivalsByParent);
    if (!directory) return null;
    const members = loadMirrorDirectoryMembers(location.anchorId);
    entries.push(...members);
    const scoped = collectDirectoryMembers(location.anchorId, members);
    if (scoped.folders.some(folderCouldClaimFileName)) return null;
    directories.set(location.anchorId, { anchorId: location.anchorId, directory, ...scoped });
  }
  return directories;
}

function planDirectory(args: {
  directory: ScopedDirectory;
  manualTopicsByArticleId: Map<string, MirrorNode[]>;
  mirrorRoot: string;
  selected: Set<string>;
  snapshot: WorkspaceSnapshot;
  articles: MirrorNode[];
}) {
  const { directory, snapshot } = args;
  const articles = args.articles.filter((article) => directory.members.has(article.id));
  const manualTopicIds = new Map(articles.filter((article) => args.selected.has(article.id))
    .map((article) => [article.id, (args.manualTopicsByArticleId.get(article.id) ?? []).map((node) => node.id)]));
  const positions = orderScopedNodes(snapshot, directory.anchorId, [...articles.map((article) => article.id),
    ...[...manualTopicIds.values()].flat()]);
  if (!positions) return null;
  const byPosition = (left: string, right: string) => positions.get(left)! - positions.get(right)!;
  articles.sort((left, right) => byPosition(left.id, right.id));
  const usedNames = new Set<string>(directory.anchorId === null ? ['inbox', 'trash'] : []);
  const derivedByParent = collectDerivedNodeIdsByParent(snapshot);
  return articles.map((article): ArticleMirrorPlan => {
    const targetPath = path.join(directory.directory, createStableFileName(article.title, article.createdAt, usedNames));
    const relativePath = path.relative(args.mirrorRoot, targetPath).split(path.sep).join('/');
    const topics = manualTopicIds.get(article.id)?.sort(byPosition);
    if (!topics) {
      return { articleId: article.id, derivedNodeIds: [], manualTopicIds: [], relativePath, sourceUpdatedAt: article.updatedAt, targetPath };
    }
    const derivedNodeIds = collectDerivedDescendants([article.id, ...topics], derivedByParent);
    // Same key order as the full planner: plan revisions compare serialized plans.
    return { articleId: article.id, derivedNodeIds, manualTopicIds: topics, relativePath,
      sourceUpdatedAt: resolveSourceUpdatedAt(snapshot, [...derivedNodeIds, ...topics], article.updatedAt), targetPath };
  });
}

/**
 * Plans the selected articles from their own directories only: the ancestor chain, the folders that compete for
 * its names, and the nodes that share each target directory. Returns null whenever the result could depend on
 * anything outside that scope, so the caller plans the whole library instead.
 */
export function planScopedMirrorArticles(articleIds: string[], mirrorRoot: string): ScopedMirrorPlanning | null {
  if (articleIds.length === 0 || hasFolderBelowNonFolder()) return null;
  const loaded = loadLocations(articleIds);
  if (!loaded) return null;
  const entries = [...loaded.chains];
  const directories = resolveDirectories(loaded.locations, mirrorRoot, entries);
  if (!directories) return null;
  const snapshot = buildPartialSnapshot(entries);
  const { articles, manualTopicsByArticleId } = collectArticleData(snapshot);
  const selected = new Set(articleIds);
  const plans: ArticleMirrorPlan[] = [];
  for (const directory of directories.values()) {
    const directoryPlans = planDirectory({ articles, directory, manualTopicsByArticleId, mirrorRoot, selected, snapshot });
    if (!directoryPlans) return null;
    plans.push(...directoryPlans);
  }
  if (articleIds.some((articleId) => !plans.some((plan) => plan.articleId === articleId))) return null;
  const directoryFoldersByArticleId = new Map(articleIds.map((articleId) =>
    [articleId, directories.get(loaded.locations.get(articleId)!.anchorId)!.folders]));
  return { directoryFoldersByArticleId, plans, snapshot };
}
