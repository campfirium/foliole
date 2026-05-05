import { buildNodeBreadcrumbs } from '../../features/nodes/model/nodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';

export interface WorkspaceNodeSearchResult {
  id: string;
  path: string;
  title: string;
}

const MAX_RESULTS = 40;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function buildNodePathLabel(node: Node, nodesById: Record<string, Node>) {
  const breadcrumbItems = buildNodeBreadcrumbs(node.parentNodeId, nodesById);
  if (!breadcrumbItems.length) {
    return 'Top level';
  }
  return breadcrumbItems.map((item) => item.title.trim() || 'Untitled').join(' / ');
}

export function buildNodeSearchResults(
  nodeOrder: string[],
  nodesById: Record<string, Node | undefined>,
  trashedNodeIds: string[],
  query: string
): WorkspaceNodeSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const availableNodesById = Object.fromEntries(
    Object.entries(nodesById).filter((entry): entry is [string, Node] => Boolean(entry[1]))
  );
  const trashedNodeSet = new Set(trashedNodeIds);
  const results: WorkspaceNodeSearchResult[] = [];

  for (const nodeId of nodeOrder) {
    if (trashedNodeSet.has(nodeId)) {
      continue;
    }
    const node = nodesById[nodeId];
    if (!node) {
      continue;
    }
    const title = normalizeWhitespace(node.title);
    if (!title.toLowerCase().includes(normalizedQuery)) {
      continue;
    }
    results.push({
      id: node.id,
      path: buildNodePathLabel(node, availableNodesById),
      title: title || 'Untitled'
    });
    if (results.length >= MAX_RESULTS) {
      break;
    }
  }

  return results;
}
