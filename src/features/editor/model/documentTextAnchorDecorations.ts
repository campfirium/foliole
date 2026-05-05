import { getTextAnchorLocators, type Node } from '../../nodes/model/nodeTypes';
import { type EditorTextAnchorDecoration } from '../adapters/EditorAdapter';

function resolveNodeTextAnchorDecorations(
  node: Node,
  parentContent: string
): EditorTextAnchorDecoration[] {
  const anchorLink = node.anchorLink;
  const locators = getTextAnchorLocators(anchorLink?.locator);
  if (!anchorLink || locators.length === 0) {
    return [];
  }
  return locators
    .map((locator) => {
      const from = Math.max(0, Math.min(locator.from, parentContent.length));
      const to = Math.max(from, Math.min(locator.to, parentContent.length));
      return { from, to };
    })
    .filter((selection) => selection.from < selection.to)
    .map((selection) => ({
      from: selection.from,
      kind: anchorLink.kind,
      to: selection.to
    }));
}

export function collectDocumentTextAnchorDecorations(args: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  parentContent: string;
  trashedNodeIds: string[];
}) {
  if (!args.activeNodeId) {
    return [];
  }
  const trashedNodeIdSet = new Set(args.trashedNodeIds);
  return Object.values(args.nodesById)
    .filter((node) => node.parentNodeId === args.activeNodeId && !trashedNodeIdSet.has(node.id))
    .flatMap((node) => resolveNodeTextAnchorDecorations(node, args.parentContent));
}
