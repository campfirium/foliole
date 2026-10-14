import { buildNodeTreeRows } from '../../features/nodes/model/nodeTree';
import { getPdfAnchorLocators, type Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

export interface PdfHighlightLocator {
  id: string;
  label: string;
  nodeId: string;
  kind: 'highlight' | 'image-excerpt';
  page: number;
  x: number | null;
  y: number | null;
  rects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
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
  nodesById: Record<string, Node>,
  trashedNodeIds: string[] = []
): PdfHighlightLocator[] {
  const trashedNodeIdSet = new Set(trashedNodeIds);
  const subtreeNodeIds = collectOrderedSubtreeNodeIds(rootNodeId, nodeOrder, nodesById);
  const seenLocatorIds = new Set<string>();
  const locators: PdfHighlightLocator[] = [];

  for (const nodeId of subtreeNodeIds) {
    if (trashedNodeIdSet.has(nodeId)) {
      continue;
    }
    const node = nodesById[nodeId];
    const anchor = node?.anchorLink;
    if (!node || (anchor?.kind !== 'highlight' && anchor?.kind !== 'image-excerpt') || !anchor.id || getPdfAnchorLocators(anchor.locator).length === 0) {
      continue;
    }
    if (seenLocatorIds.has(anchor.id)) {
      continue;
    }
    seenLocatorIds.add(anchor.id);
    for (const fragment of getPdfAnchorLocators(anchor.locator)) {
      locators.push({
        id: anchor.id,
        label: node.title,
        nodeId: node.id,
        kind: anchor.kind,
        page: fragment.page,
        rects: fragment.rects ?? [],
        x: fragment.x,
        y: fragment.y
      });
    }
  }

  return locators;
}
