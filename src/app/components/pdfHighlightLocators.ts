import { getPdfAnchorLocators, type Node } from '../../features/nodes/model/nodeTypes';

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
  const knownIds = new Set(nodeOrder.filter((nodeId) => Boolean(nodesById[nodeId])));
  if (!knownIds.has(rootNodeId)) return [];

  // The tree exposes nodes in a disconnected cycle as individual root rows.
  const ancestorIds = new Set<string>();
  let ancestorId: string | null = rootNodeId;
  while (ancestorId && knownIds.has(ancestorId)) {
    if (ancestorIds.has(ancestorId)) return [rootNodeId];
    ancestorIds.add(ancestorId);
    ancestorId = nodesById[ancestorId]?.parentNodeId ?? null;
  }

  const childrenByParent = new Map<string, string[]>();
  for (const nodeId of nodeOrder) {
    const parentId = nodesById[nodeId]?.parentNodeId;
    if (!parentId || !knownIds.has(parentId)) continue;
    const siblings = childrenByParent.get(parentId);
    if (siblings) siblings.push(nodeId);
    else childrenByParent.set(parentId, [nodeId]);
  }

  const subtreeIds: string[] = [];
  const visited = new Set<string>();
  const pending = [rootNodeId];
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    subtreeIds.push(nodeId);
    const children = childrenByParent.get(nodeId) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]!);
    }
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
