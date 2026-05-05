import { buildNodeBreadcrumbs } from '../../features/nodes/model/nodeBreadcrumbs';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';

export interface WorkspaceNodeSearchResult {
  id: string;
  keywords: string[];
  path: string;
  title: string;
}

interface RankedWorkspaceNodeSearchResult extends WorkspaceNodeSearchResult {
  score: number;
}

const MAX_RESULTS = 40;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function buildNodePathLabel(node: WorkspaceListNode, nodesById: Record<string, WorkspaceListNode>) {
  const breadcrumbItems = buildNodeBreadcrumbs(node.parentNodeId, nodesById);
  if (!breadcrumbItems.length) {
    return 'Top level';
  }
  return breadcrumbItems.map((item) => item.title.trim() || 'Untitled').join(' / ');
}

function buildNodeKeywords(node: WorkspaceListNode) {
  return node.specialKind === 'inbox' ? ['inbox'] : [];
}

function resolveQueryScore(input: {
  index: number;
  keywords: string[];
  path: string;
  query: string;
  recentIndex: number;
  title: string;
}) {
  const title = input.title.toLowerCase();
  const path = input.path.toLowerCase();
  let score = input.recentIndex >= 0 ? 1000 - input.recentIndex : 0;
  score += Math.max(0, 80 - input.index);

  if (!input.query) {
    return score + 100;
  }
  if (title === input.query) {
    score += 500;
  } else if (title.startsWith(input.query)) {
    score += 380;
  } else if (title.includes(input.query)) {
    score += 260;
  } else if (path.includes(input.query)) {
    score += 120;
  }

  for (const keyword of input.keywords) {
    const lowered = keyword.toLowerCase();
    if (lowered === input.query) {
      score += 420;
      continue;
    }
    if (lowered.startsWith(input.query)) {
      score += 360;
      continue;
    }
    if (lowered.includes(input.query)) {
      score += 280;
    }
  }

  return score;
}

export function buildNodeSearchResults(
  nodeOrder: string[],
  nodesById: Record<string, WorkspaceListNode | undefined>,
  recentNodeIds: string[],
  trashedNodeIds: string[],
  query: string
): WorkspaceNodeSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const availableNodesById = Object.fromEntries(
    Object.entries(nodesById).filter((entry): entry is [string, WorkspaceListNode] => Boolean(entry[1]))
  );
  const trashedNodeSet = new Set(trashedNodeIds);
  const recentIndexById = new Map(recentNodeIds.map((nodeId, index) => [nodeId, index]));

  return nodeOrder
    .flatMap((nodeId, index) => {
      if (trashedNodeSet.has(nodeId)) {
        return [];
      }
      const node = nodesById[nodeId];
      if (!node) {
        return [];
      }
      const title = normalizeWhitespace(node.title) || 'Untitled';
      const path = buildNodePathLabel(node, availableNodesById);
      const keywords = buildNodeKeywords(node);
      const score = resolveQueryScore({
        index,
        keywords,
        path,
        query: normalizedQuery,
        recentIndex: recentIndexById.get(node.id) ?? -1,
        title
      });
      if (normalizedQuery && score < 200) {
        return [];
      }
      return [{ id: node.id, keywords, path, score, title }];
    })
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, MAX_RESULTS)
    .map(stripSearchScore);
}

function stripSearchScore(result: RankedWorkspaceNodeSearchResult): WorkspaceNodeSearchResult {
  const { score, ...rest } = result;
  void score;
  return rest;
}
