import type { WorkspaceListNode, WorkspaceListNodesById } from './workspaceListNode';

export interface NodeTreeRow {
  descendantCount: number;
  depth: number;
  hasChildren: boolean;
  node: WorkspaceListNode;
}

export interface NodeTreeModel {
  parentById: Record<string, string | null>;
  rows: NodeTreeRow[];
}

function buildNodeRelationships(nodeOrder: string[], nodesById: WorkspaceListNodesById) {
  const knownIds = new Set(nodeOrder.filter((nodeId) => Boolean(nodesById[nodeId])));
  const childrenByParent = new Map<string | null, string[]>();
  const parentById: Record<string, string | null> = {};

  for (const nodeId of nodeOrder) {
    const node = nodesById[nodeId];
    if (!node) {
      continue;
    }

    const parentId =
      node.parentNodeId && knownIds.has(node.parentNodeId) ? node.parentNodeId : null;
    parentById[nodeId] = parentId;
    const siblings = childrenByParent.get(parentId);
    if (siblings) {
      siblings.push(nodeId);
      continue;
    }
    childrenByParent.set(parentId, [nodeId]);
  }

  return { childrenByParent, parentById };
}

function createDescendantCounter(childrenByParent: Map<string | null, string[]>) {
  const descendantCountById = new Map<string, number>();

  const countDescendants = (nodeId: string) => {
    const cached = descendantCountById.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }

    const children = childrenByParent.get(nodeId) ?? [];
    let count = children.length;
    for (const childId of children) {
      count += countDescendants(childId);
    }

    descendantCountById.set(nodeId, count);
    return count;
  };

  return countDescendants;
}

function createTreeRow(
  depth: number,
  node: WorkspaceListNode,
  childrenByParent: Map<string | null, string[]>,
  countDescendants: (nodeId: string) => number
): NodeTreeRow {
  return {
    descendantCount: countDescendants(node.id),
    depth,
    hasChildren: (childrenByParent.get(node.id)?.length ?? 0) > 0,
    node
  };
}

export function buildNodeTree(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById
): NodeTreeModel {
  const { childrenByParent, parentById } = buildNodeRelationships(nodeOrder, nodesById);
  const rows: NodeTreeRow[] = [];
  const visited = new Set<string>();
  const countDescendants = createDescendantCounter(childrenByParent);

  const walk = (parentId: string | null, depth: number) => {
    const children = childrenByParent.get(parentId) ?? [];
    for (const childId of children) {
      if (visited.has(childId)) {
        continue;
      }

      const node = nodesById[childId];
      if (!node) {
        continue;
      }

      visited.add(childId);
      rows.push(createTreeRow(depth, node, childrenByParent, countDescendants));

      walk(childId, depth + 1);
    }
  };

  walk(null, 0);

  for (const nodeId of nodeOrder) {
    if (visited.has(nodeId)) {
      continue;
    }
    const node = nodesById[nodeId];
    if (!node) {
      continue;
    }

    rows.push(createTreeRow(0, node, childrenByParent, countDescendants));
  }

  return { parentById, rows };
}

export function buildNodeTreeRows(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById
): NodeTreeRow[] {
  return buildNodeTree(nodeOrder, nodesById).rows;
}

export function buildFlatNodeRows(
  nodeOrder: string[],
  nodesById: WorkspaceListNodesById
): NodeTreeRow[] {
  return nodeOrder
    .map((nodeId) => nodesById[nodeId])
    .filter((node): node is WorkspaceListNode => Boolean(node))
    .map((node) => ({
      descendantCount: 0,
      depth: 0,
      hasChildren: false,
      node
    }));
}

export function buildVisibleNodeTreeRows(
  rows: NodeTreeRow[],
  collapsedNodeIds: ReadonlySet<string>
): NodeTreeRow[] {
  const visibleRows: NodeTreeRow[] = [];
  const collapsedDepthStack: number[] = [];

  for (const row of rows) {
    while (
      collapsedDepthStack.length > 0 &&
      row.depth <= collapsedDepthStack[collapsedDepthStack.length - 1]
    ) {
      collapsedDepthStack.pop();
    }

    if (collapsedDepthStack.length > 0) {
      continue;
    }

    visibleRows.push(row);
    if (row.hasChildren && collapsedNodeIds.has(row.node.id)) {
      collapsedDepthStack.push(row.depth);
    }
  }

  return visibleRows;
}

export function collectNodeAncestorIds(
  nodeId: string,
  parentById: Record<string, string | null>
): string[] {
  const ancestors: string[] = [];
  let current = parentById[nodeId] ?? null;

  while (current) {
    ancestors.push(current);
    current = parentById[current] ?? null;
  }

  return ancestors;
}

export function filterNodeTreeRowsByTitle(rows: NodeTreeRow[], searchQuery: string): NodeTreeRow[] {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return rows;
  }

  const matchingNodeIds = new Set(
    rows
      .filter((row) => row.node.title.toLocaleLowerCase().includes(normalizedQuery))
      .map((row) => row.node.id)
  );

  if (matchingNodeIds.size === 0) {
    return [];
  }

  const visibleNodeIds = new Set<string>();
  for (const row of rows) {
    if (!matchingNodeIds.has(row.node.id)) {
      continue;
    }

    visibleNodeIds.add(row.node.id);
    for (let depth = row.depth - 1; depth >= 0; depth -= 1) {
      const ancestor = rows
        .slice(0, rows.indexOf(row))
        .reverse()
        .find((candidate) => candidate.depth === depth);
      if (ancestor) {
        visibleNodeIds.add(ancestor.node.id);
      }
    }
  }

  return rows.filter((row) => visibleNodeIds.has(row.node.id));
}
