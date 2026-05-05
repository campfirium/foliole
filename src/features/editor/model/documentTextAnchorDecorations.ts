import { isTextAnchorLocator, type Node } from '../../nodes/model/nodeTypes';
import type { EditorTextAnchorDecoration } from '../adapters/EditorAdapter';

import { hasInlineAnchorMarkup } from './anchorBlocks';
import { createAnchorKey } from './anchorRecords';
import { resolveTextAnchorLocatorSelection } from './textAnchorLocatorResolution';

function resolveNodeTextAnchorDecoration(
  node: Node,
  parentContent: string
): EditorTextAnchorDecoration | null {
  const anchorLink = node.anchorLink;
  if (!anchorLink || !isTextAnchorLocator(anchorLink.locator)) {
    return null;
  }
  const selection = resolveTextAnchorLocatorSelection(parentContent, anchorLink.locator);
  if (!selection) {
    return null;
  }
  return {
    from: selection.from,
    kind: anchorLink.kind,
    to: selection.to
  };
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
    .map((node) => resolveNodeTextAnchorDecoration(node, args.parentContent))
    .filter((entry): entry is EditorTextAnchorDecoration => entry !== null);
}

export function collectLegacyInlineAnchorKeys(args: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  parentContent: string;
  trashedNodeIds: string[];
}) {
  if (!args.activeNodeId || !hasInlineAnchorMarkup(args.parentContent)) {
    return [];
  }
  const hiddenKeys = new Set<string>();
  for (const trashedNodeId of args.trashedNodeIds) {
    const node = args.nodesById[trashedNodeId];
    if (!node || node.parentNodeId !== args.activeNodeId || !node.anchorLink || node.anchorLink.locator) {
      continue;
    }
    hiddenKeys.add(createAnchorKey(node.anchorLink));
  }
  return [...hiddenKeys];
}

export function collectDocumentTextAnchorPresentation(args: {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  parentContent: string;
  trashedNodeIds: string[];
}) {
  return {
    inlineAnchorCompatibility: {
      hiddenKeys: collectLegacyInlineAnchorKeys(args)
    },
    textAnchorDecorations: collectDocumentTextAnchorDecorations(args)
  };
}
