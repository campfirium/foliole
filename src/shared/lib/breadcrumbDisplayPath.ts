import type { NodeKind } from '../../../lib/core/nodes/nodeKind';

export interface BreadcrumbDisplayPathNode {
  id: string;
  kind?: NodeKind;
  parentNodeId: string | null;
  title: string;
}

export interface BreadcrumbDisplayPathItem {
  id: string;
  targetNodeId: string;
  title: string;
}

function collectPath(
  nodeId: string | null,
  nodesById: Record<string, BreadcrumbDisplayPathNode | undefined>
) {
  if (!nodeId) {
    return [];
  }

  const path: BreadcrumbDisplayPathNode[] = [];
  const visited = new Set<string>();
  let cursorId: string | null = nodeId;

  while (cursorId) {
    if (visited.has(cursorId)) {
      break;
    }
    visited.add(cursorId);
    const node: BreadcrumbDisplayPathNode | undefined = nodesById[cursorId];
    if (!node) {
      break;
    }
    path.push(node);
    cursorId = node.parentNodeId;
  }

  return path.reverse();
}

function normalizeTitle(title: string, untitledLabel: string) {
  const trimmed = title.trim();
  return trimmed || untitledLabel;
}

function abbreviateTitle(title: string, untitledLabel: string) {
  const normalized = normalizeTitle(title, untitledLabel);
  const glyphs = Array.from(normalized);
  if (glyphs.length <= 2) {
    return normalized;
  }
  return `${glyphs.slice(0, 2).join('')}...`;
}

function findArticleIndex(
  path: BreadcrumbDisplayPathNode[],
  nodesById: Record<string, BreadcrumbDisplayPathNode | undefined>
) {
  return path.findIndex((node) => {
    if (node.kind !== 'topic') {
      return false;
    }
    const parentNode = node.parentNodeId ? nodesById[node.parentNodeId] : null;
    return !parentNode || parentNode.kind === 'folder';
  });
}

function resolveTargetNodeId(
  node: BreadcrumbDisplayPathNode,
  isNestedUnderArticle: boolean,
  articleNodeId: string | null
) {
  if (node.kind === 'folder' || node.kind === 'topic') {
    return node.id;
  }
  if (articleNodeId && isNestedUnderArticle) {
    return articleNodeId;
  }
  return node.id;
}

function resolveDisplayTitle(
  node: BreadcrumbDisplayPathNode,
  isNestedUnderArticle: boolean,
  untitledLabel: string
) {
  if (node.kind === 'topic') {
    return normalizeTitle(node.title, untitledLabel);
  }
  return isNestedUnderArticle ? abbreviateTitle(node.title, untitledLabel) : normalizeTitle(node.title, untitledLabel);
}

export function buildBreadcrumbDisplayPath(
  nodeId: string | null,
  nodesById: Record<string, BreadcrumbDisplayPathNode | undefined>,
  options: { untitledLabel?: string } = {}
): BreadcrumbDisplayPathItem[] {
  const untitledLabel = options.untitledLabel ?? 'Untitled';
  const fullPath = collectPath(nodeId, nodesById);
  const ancestorPath = fullPath.slice(0, -1);
  const articleIndex = findArticleIndex(ancestorPath, nodesById);
  const articleNodeId = articleIndex >= 0 ? ancestorPath[articleIndex]?.id ?? null : null;

  return ancestorPath.map((node, index) => ({
    id: node.id,
    targetNodeId: resolveTargetNodeId(node, index > articleIndex, articleNodeId),
    title: resolveDisplayTitle(node, articleIndex >= 0 && index > articleIndex, untitledLabel)
  }));
}
