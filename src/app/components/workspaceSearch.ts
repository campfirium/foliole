import type { Node } from '../../features/nodes/model/nodeTypes';

export interface WorkspaceSearchResult {
  excerpt: string;
  id: string;
  title: string;
}

const MAX_RESULTS = 40;
const EXCERPT_PADDING = 36;
const EXCERPT_LENGTH = 96;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function buildExcerpt(content: string, query: string) {
  const normalizedContent = normalizeWhitespace(content);
  if (!normalizedContent) {
    return 'No content preview';
  }

  const normalizedQuery = query.trim().toLowerCase();
  const matchIndex = normalizedContent.toLowerCase().indexOf(normalizedQuery);
  if (matchIndex === -1) {
    return normalizedContent.slice(0, EXCERPT_LENGTH);
  }

  const start = Math.max(0, matchIndex - EXCERPT_PADDING);
  const end = Math.min(normalizedContent.length, matchIndex + normalizedQuery.length + EXCERPT_PADDING);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < normalizedContent.length ? '...' : '';
  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

function matchesWorkspaceNode(node: Node, normalizedQuery: string) {
  const normalizedTitle = node.title.trim().toLowerCase();
  if (normalizedTitle.includes(normalizedQuery)) {
    return true;
  }
  return node.content.toLowerCase().includes(normalizedQuery);
}

export function buildWorkspaceSearchResults(
  nodeOrder: string[],
  nodesById: Record<string, Node | undefined>,
  trashedNodeIds: string[],
  query: string
): WorkspaceSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const trashedNodeSet = new Set(trashedNodeIds);
  const titleMatches: WorkspaceSearchResult[] = [];
  const contentMatches: WorkspaceSearchResult[] = [];

  for (const nodeId of nodeOrder) {
    if (trashedNodeSet.has(nodeId)) {
      continue;
    }
    const node = nodesById[nodeId];
    if (!node || !matchesWorkspaceNode(node, normalizedQuery)) {
      continue;
    }

    const result = {
      excerpt: buildExcerpt(node.content, normalizedQuery),
      id: node.id,
      title: node.title.trim() || 'Untitled'
    };

    if (node.title.trim().toLowerCase().includes(normalizedQuery)) {
      titleMatches.push(result);
    } else {
      contentMatches.push(result);
    }

    if (titleMatches.length + contentMatches.length >= MAX_RESULTS) {
      break;
    }
  }

  return [...titleMatches, ...contentMatches].slice(0, MAX_RESULTS);
}
