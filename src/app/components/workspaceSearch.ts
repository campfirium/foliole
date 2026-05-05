import { buildNodeBreadcrumbs } from '../../features/nodes/model/nodeBreadcrumbs';
import type { WorkspaceListNode } from '../../features/nodes/model/workspaceListNode';

export interface WorkspaceSearchResult {
  excerpt: string;
  id: string;
  title: string;
}

const MAX_RESULTS = 40;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function buildPathLabel(node: WorkspaceListNode, nodesById: Record<string, WorkspaceListNode>) {
  const breadcrumbItems = buildNodeBreadcrumbs(node.parentNodeId, nodesById);
  if (!breadcrumbItems.length) {
    return 'Top level';
  }
  return breadcrumbItems.map((item) => item.title.trim() || 'Untitled').join(' / ');
}

export function buildWorkspaceSearchResults(
  nodeOrder: string[],
  nodesById: Record<string, WorkspaceListNode | undefined>,
  trashedNodeIds: string[],
  query: string
): WorkspaceSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const availableNodesById = Object.fromEntries(
    Object.entries(nodesById).filter((entry): entry is [string, WorkspaceListNode] => Boolean(entry[1]))
  );
  const trashedNodeSet = new Set(trashedNodeIds);
  const results: WorkspaceSearchResult[] = [];

  for (const nodeId of nodeOrder) {
    if (trashedNodeSet.has(nodeId)) {
      continue;
    }
    const node = nodesById[nodeId];
    if (!node) {
      continue;
    }
    const title = normalizeWhitespace(node.title) || 'Untitled';
    const path = buildPathLabel(node, availableNodesById);
    const haystack = `${title}\n${path}`.toLowerCase();
    if (!haystack.includes(normalizedQuery)) {
      continue;
    }
    results.push({
      excerpt: path,
      id: node.id,
      title
    });
    if (results.length >= MAX_RESULTS) {
      break;
    }
  }

  return results;
}
