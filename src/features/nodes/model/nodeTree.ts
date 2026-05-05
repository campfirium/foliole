import type { Node } from './nodeTypes';

export interface NodeTreeRow {
  depth: number;
  hasChildren: boolean;
  node: Node;
}

export interface NodeTreeModel {
  parentById: Record<string, string | null>;
  rows: NodeTreeRow[];
}

export function buildNodeTree(nodeOrder: string[], nodesById: Record<string, Node>): NodeTreeModel {
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

  const rows: NodeTreeRow[] = [];
  const visited = new Set<string>();

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
      rows.push({
        depth,
        hasChildren: (childrenByParent.get(childId)?.length ?? 0) > 0,
        node
      });

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

    rows.push({
      depth: 0,
      hasChildren: (childrenByParent.get(nodeId)?.length ?? 0) > 0,
      node
    });
  }

  return { parentById, rows };
}

export function buildNodeTreeRows(
  nodeOrder: string[],
  nodesById: Record<string, Node>
): NodeTreeRow[] {
  return buildNodeTree(nodeOrder, nodesById).rows;
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
