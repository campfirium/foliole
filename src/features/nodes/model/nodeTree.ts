import type { Node } from './nodeTypes';

export interface NodeTreeRow {
  depth: number;
  hasChildren: boolean;
  node: Node;
}

export function buildNodeTreeRows(nodeOrder: string[], nodesById: Record<string, Node>): NodeTreeRow[] {
  const knownIds = new Set(nodeOrder.filter((nodeId) => Boolean(nodesById[nodeId])));
  const childrenByParent = new Map<string | null, string[]>();

  for (const nodeId of nodeOrder) {
    const node = nodesById[nodeId];
    if (!node) {
      continue;
    }

    const parentId = node.parentNodeId && knownIds.has(node.parentNodeId) ? node.parentNodeId : null;
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

  return rows;
}
