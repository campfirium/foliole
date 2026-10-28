import { getTextAnchorLocators, isTextAnchorLocator } from '../features/nodes/model/nodeTypes';
import { resolveTextAnchorLocatorInContent } from '../features/nodes/model/textAnchorResolution';

interface TextAnchorTargetNode {
  id: string;
  content: string;
  parentNodeId: string | null;
  anchorLink?: { kind: string; locator?: unknown } | null;
}

export type LocatorHighlightMatch = {
  canAdjustRange?: boolean;
  kind: 'cloze' | 'highlight';
  locator: { from: number; originalText: string; to: number };
  originalText: string;
  nodeId: string;
};

function* ownNodeIds(nodesById: Record<string, TextAnchorTargetNode>) {
  for (const nodeId in nodesById) {
    if (Object.hasOwn(nodesById, nodeId)) yield nodeId;
  }
}

export function findTextAnchorAtPosition(
  activeNodeId: string,
  nodesById: Record<string, TextAnchorTargetNode>,
  position: number,
  trashedNodeIds: string[],
  parentContent = nodesById[activeNodeId]?.content,
  candidateNodeIds: Iterable<string> = ownNodeIds(nodesById)
): LocatorHighlightMatch | null {
  const trashedNodeIdSet = new Set(trashedNodeIds);
  const matches: LocatorHighlightMatch[] = [];
  for (const nodeId of candidateNodeIds) {
    const node = nodesById[nodeId];
    if (
      !node ||
      node.parentNodeId !== activeNodeId ||
      trashedNodeIdSet.has(node.id) ||
      (node.anchorLink?.kind !== 'highlight' && node.anchorLink?.kind !== 'cloze')
    ) {
      continue;
    }
    const kind: LocatorHighlightMatch['kind'] = node.anchorLink.kind;
    const canAdjustRange = isTextAnchorLocator(node.anchorLink.locator);
    for (const storedLocator of getTextAnchorLocators(node.anchorLink.locator)) {
      const locator = parentContent === undefined
        ? storedLocator
        : resolveTextAnchorLocatorInContent(parentContent, storedLocator);
      if (!locator || !(locator.from <= position && position < locator.to)) continue;
      matches.push({
        ...(canAdjustRange ? { canAdjustRange } : {}),
        kind,
        locator,
        nodeId: node.id,
        originalText: locator.originalText
      });
    }
  }
  return matches.length === 1 ? matches[0] ?? null : null;
}
