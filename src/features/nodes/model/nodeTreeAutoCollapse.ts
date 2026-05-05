import { collectNodeAncestorIds, type NodeTreeRow } from './nodeTree';
import type { Node } from './nodeTypes';

interface AutoCollapsedNodeIdsInput {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  parentById: Record<string, string | null>;
  rows: NodeTreeRow[];
}

export function buildAutoCollapsedNodeIds({
  activeNodeId,
  nodesById,
  parentById,
  rows
}: AutoCollapsedNodeIdsInput): Set<string> {
  const collapsibleNodeIds = rows.filter((row) => row.hasChildren).map((row) => row.node.id);
  if (!activeNodeId || !nodesById[activeNodeId]) {
    return new Set(
      collapsibleNodeIds.filter((nodeId) => hasDerivedChildren(nodeId, rows, nodesById))
    );
  }

  const expandedNodeIds = collectExpandedNodeIds(activeNodeId, nodesById, parentById);
  return new Set(collapsibleNodeIds.filter((nodeId) => !expandedNodeIds.has(nodeId)));
}

export function resolveNodeListFocusContextId(
  activeNodeId: string | null,
  nodesById: Record<string, Node>,
  parentById: Record<string, string | null>
): string | null {
  if (!activeNodeId || !nodesById[activeNodeId]) {
    return null;
  }

  let currentNodeId: string | null = activeNodeId;
  while (currentNodeId) {
    const currentNode = nodesById[currentNodeId];
    if (!currentNode?.anchorLink) {
      return currentNodeId;
    }
    currentNodeId = parentById[currentNodeId] ?? null;
  }

  return activeNodeId;
}

function collectExpandedNodeIds(
  activeNodeId: string,
  nodesById: Record<string, Node>,
  parentById: Record<string, string | null>
) {
  const expandedNodeIds = new Set(collectNodeAncestorIds(activeNodeId, parentById));
  let currentNodeId: string | null = activeNodeId;

  while (currentNodeId) {
    const currentNode = nodesById[currentNodeId];
    if (!currentNode?.anchorLink) {
      expandedNodeIds.add(currentNodeId);
      break;
    }
    currentNodeId = parentById[currentNodeId] ?? null;
  }

  return expandedNodeIds;
}

function hasDerivedChildren(
  nodeId: string,
  rows: NodeTreeRow[],
  nodesById: Record<string, Node>
) {
  return rows.some((row) => {
    if (row.node.parentNodeId !== nodeId) {
      return false;
    }
    return Boolean(nodesById[row.node.id]?.anchorLink);
  });
}
