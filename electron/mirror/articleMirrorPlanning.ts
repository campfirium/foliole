import path from 'node:path';

import type { WorkspaceSnapshot } from '../database/workspaceSnapshot.js';

import { collectArticleData } from './articleMirrorTree.js';
import { createRootReservedDirectoryNames, resolveArticleDirectory } from './mirrorTargetDirectories.js';

export interface ArticleMirrorPlan {
  articleId: string;
  derivedNodeIds: string[];
  manualTopicIds: string[];
  relativePath: string;
  sourceUpdatedAt: string;
  targetPath: string;
}

function sanitizeArticleTitle(title: string) {
  const cleaned = Array.from(title)
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || '<>:"/\\|?*'.includes(character) ? ' ' : character;
    })
    .join('')
    .replace(/[.\s]+$/g, '')
    .trim();
  return cleaned || 'Untitled';
}

function formatTimestamp(timestamp: string) {
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return 'unknown000000';
  return new Date(parsed).toISOString().slice(2, 19).replaceAll('-', '').replace('T', '').replaceAll(':', '');
}

function createStableFileName(title: string, createdAt: string, usedNames: Set<string>) {
  const baseName = sanitizeArticleTitle(title);
  const candidates = [`${baseName}.md`, `${baseName}${formatTimestamp(createdAt)}.md`];
  for (const candidate of candidates) {
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
  let duplicateIndex = 2;
  while (usedNames.has(`${baseName}${formatTimestamp(createdAt)}${duplicateIndex}.md`)) duplicateIndex += 1;
  const candidate = `${baseName}${formatTimestamp(createdAt)}${duplicateIndex}.md`;
  usedNames.add(candidate);
  return candidate;
}

function createStableDirectoryName(title: string, nodeId: string, usedNames: Set<string>) {
  const baseName = sanitizeArticleTitle(title);
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }
  const suffix = nodeId.replace(/^node-/, '').slice(0, 8) || nodeId.slice(-8);
  const candidate = `${baseName}--${suffix}`;
  usedNames.add(candidate);
  return candidate;
}

function resolveSourceUpdatedAt(snapshot: WorkspaceSnapshot, nodeIds: string[], initial: string) {
  return nodeIds.reduce((latest, nodeId) => {
    const updatedAt = snapshot.nodesById[nodeId]?.updatedAt;
    return updatedAt && updatedAt > latest ? updatedAt : latest;
  }, initial);
}

export function collectArticleMirrorPlans(snapshot: WorkspaceSnapshot, mirrorRoot: string): ArticleMirrorPlan[] {
  const { articles, manualTopicsByArticleId } = collectArticleData(snapshot);
  const usedFileNamesByDirectory = new Map<string, Set<string>>();
  const usedDirectoryNamesByParent = createRootReservedDirectoryNames(mirrorRoot);
  const resolvedFolderDirectories = new Map<string, string>();

  return articles.map((article) => {
    const targetDirectory = resolveArticleDirectory(
      article,
      snapshot,
      mirrorRoot,
      resolvedFolderDirectories,
      usedDirectoryNamesByParent,
      createStableDirectoryName
    );
    const usedNames = usedFileNamesByDirectory.get(targetDirectory) ?? new Set<string>();
    usedFileNamesByDirectory.set(targetDirectory, usedNames);
    const targetPath = path.join(targetDirectory, createStableFileName(article.title, article.createdAt, usedNames));
    const derivedNodeIds = Object.values(snapshot.nodesById)
      .filter((node) => node.parentNodeId === article.id && node.anchorLink !== null)
      .map((node) => node.id);
    const manualTopicIds = (manualTopicsByArticleId.get(article.id) ?? []).map((node) => node.id);
    return {
      articleId: article.id,
      derivedNodeIds,
      manualTopicIds,
      relativePath: path.relative(mirrorRoot, targetPath).split(path.sep).join('/'),
      sourceUpdatedAt: resolveSourceUpdatedAt(snapshot, [...derivedNodeIds, ...manualTopicIds], article.updatedAt),
      targetPath
    };
  });
}
