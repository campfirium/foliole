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

export function findTextAnchorAtPosition(
  activeNodeId: string,
  nodesById: Record<string, TextAnchorTargetNode>,
  position: number,
  trashedNodeIds: string[]
): LocatorHighlightMatch | null {
  const trashedNodeIdSet = new Set(trashedNodeIds);
  const parentContent = nodesById[activeNodeId]?.content;
  const matches = Object.values(nodesById).flatMap((node) => {
    if (
      node.parentNodeId !== activeNodeId ||
      trashedNodeIdSet.has(node.id) ||
      (node.anchorLink?.kind !== 'highlight' && node.anchorLink?.kind !== 'cloze')
    ) {
      return [];
    }
    const kind: LocatorHighlightMatch['kind'] = node.anchorLink.kind;
    const canAdjustRange = isTextAnchorLocator(node.anchorLink.locator);
    return getTextAnchorLocators(node.anchorLink.locator)
      .map((locator) => parentContent === undefined
        ? locator
        : resolveTextAnchorLocatorInContent(parentContent, locator))
      .filter((locator): locator is NonNullable<typeof locator> => locator !== null)
      .filter((locator) => locator.from <= position && position < locator.to)
      .map((locator) => ({
        ...(canAdjustRange ? { canAdjustRange } : {}),
        kind,
        locator,
        nodeId: node.id,
        originalText: locator.originalText
      }));
  });
  return matches.length === 1 ? matches[0] ?? null : null;
}
