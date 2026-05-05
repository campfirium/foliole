import { buildNodeTreeRows } from '../../features/nodes/model/nodeTree';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

export interface PdfHighlightLocator {
  id: string;
  page: number;
  x: number | null;
  y: number | null;
}

function collectOrderedSubtreeNodeIds(
  rootNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>
) {
  const visibleNodeOrder = nodeOrder.filter((nodeId) => Boolean(nodesById[nodeId]));
  const rows = buildNodeTreeRows(visibleNodeOrder, toWorkspaceListNodesById(nodesById));
  const rootIndex = rows.findIndex((row) => row.node.id === rootNodeId);
  if (rootIndex < 0) {
    return [];
  }
  const rootDepth = rows[rootIndex]?.depth ?? 0;
  const subtreeIds = [rootNodeId];
  for (let index = rootIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) {
      continue;
    }
    if (row.depth <= rootDepth) {
      break;
    }
    subtreeIds.push(row.node.id);
  }
  return subtreeIds;
}

export function collectPdfHighlightLocators(
  rootNodeId: string,
  nodeOrder: string[],
  nodesById: Record<string, Node>
): PdfHighlightLocator[] {
  const subtreeNodeIds = collectOrderedSubtreeNodeIds(rootNodeId, nodeOrder, nodesById);
  const seenLocatorIds = new Set<string>();
  const locators: PdfHighlightLocator[] = [];

  for (const nodeId of subtreeNodeIds) {
    const node = nodesById[nodeId];
    const anchor = node?.anchorLink;
    if (!node || anchor?.kind !== 'highlight' || !anchor.id || !anchor.locator) {
      continue;
    }
    if (seenLocatorIds.has(anchor.id)) {
      continue;
    }
    seenLocatorIds.add(anchor.id);
    locators.push({
      id: anchor.id,
      page: anchor.locator.page,
      x: typeof anchor.locator.x === 'number' ? anchor.locator.x : null,
      y: typeof anchor.locator.y === 'number' ? anchor.locator.y : null
    });
  }

  return locators;
}
