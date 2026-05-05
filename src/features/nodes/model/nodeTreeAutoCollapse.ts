import { collectNodeAncestorIds, type NodeTreeRow } from './nodeTree';
import type { Node } from './nodeTypes';

interface DefaultCollapsedNodeIdsInput {
  nodesById: Record<string, Node>;
  rows: NodeTreeRow[];
}

interface AutoExpandedNodeIdsInput {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  parentById: Record<string, string | null>;
  rows: NodeTreeRow[];
}

export function buildDefaultCollapsedNodeIds({
  nodesById,
  rows
}: DefaultCollapsedNodeIdsInput): Set<string> {
  return new Set(
    rows
      .filter((row) => row.hasChildren)
      .map((row) => row.node.id)
      .filter(
        (nodeId) =>
          hasDerivedChildren(nodeId, rows, nodesById) &&
          !hasNonDerivedChildren(nodeId, rows, nodesById)
      )
  );
}

export function collectAutoExpandedNodeIds({
  activeNodeId,
  nodesById,
  parentById,
  rows
}: AutoExpandedNodeIdsInput): Set<string> {
  if (!activeNodeId || !nodesById[activeNodeId]) {
    return new Set();
  }

  const expandedNodeIds = new Set(
    collectNodeAncestorIds(activeNodeId, parentById).filter((nodeId) => !nodesById[nodeId]?.anchorLink)
  );
  if (hasNonDerivedChildren(activeNodeId, rows, nodesById)) {
    expandedNodeIds.add(activeNodeId);
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

function hasNonDerivedChildren(
  nodeId: string,
  rows: NodeTreeRow[],
  nodesById: Record<string, Node>
) {
  return rows.some((row) => {
    if (row.node.parentNodeId !== nodeId) {
      return false;
    }
    return !nodesById[row.node.id]?.anchorLink;
  });
}
