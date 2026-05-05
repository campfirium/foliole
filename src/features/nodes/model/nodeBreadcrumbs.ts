import type { Node } from './nodeTypes';

export interface NodeBreadcrumbItem {
  id: string;
  isEllipsis: boolean;
  title: string;
}

const DEFAULT_BREADCRUMB_MAX_ITEMS = 3;

function collectNodePath(nodeId: string | null, nodesById: Record<string, Node>): Node[] {
  if (!nodeId) {
    return [];
  }

  const path: Node[] = [];
  const visited = new Set<string>();
  let cursorId: string | null = nodeId;

  while (cursorId) {
    if (visited.has(cursorId)) {
      break;
    }
    visited.add(cursorId);

    const cursor: Node | undefined = nodesById[cursorId];
    if (!cursor) {
      break;
    }

    path.push(cursor);
    cursorId = cursor.parentNodeId;
  }

  return path.reverse();
}

function createEllipsisItem(): NodeBreadcrumbItem {
  return {
    id: '__ellipsis__',
    isEllipsis: true,
    title: '...'
  };
}

export function buildNodeBreadcrumbs(
  nodeId: string | null,
  nodesById: Record<string, Node>,
  maxItems = DEFAULT_BREADCRUMB_MAX_ITEMS
): NodeBreadcrumbItem[] {
  const path = collectNodePath(nodeId, nodesById);
  if (path.length <= maxItems) {
    return path.map((node) => ({
      id: node.id,
      isEllipsis: false,
      title: node.title
    }));
  }

  const tailCount = Math.max(2, maxItems - 1);
  const tail = path.slice(-tailCount);

  return [
    createEllipsisItem(),
    ...tail.map((node) => ({
      id: node.id,
      isEllipsis: false,
      title: node.title
    }))
  ];
}
