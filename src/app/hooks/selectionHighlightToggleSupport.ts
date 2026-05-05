import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { isTextAnchorLocator, type Node } from '../../features/nodes/model/nodeTypes';
import type { SelectionCommandPayload } from '../contextCommands';

export type NormalizedSelection = {
  from: number;
  to: number;
};

export type LocatorHighlightMatch = {
  nodeId: string;
};

export function normalizeSelection(selection: EditorSelection): NormalizedSelection {
  return {
    from: Math.min(selection.from, selection.to),
    to: Math.max(selection.from, selection.to)
  };
}

export function resolveSelection(editorRef: MutableRefObject<EditorAdapter | null>) {
  return editorRef.current?.getSelectionRanges().map(normalizeSelection).find((range) => range.from < range.to) ?? null;
}

export function findPayloadEntryLocator(payload: SelectionCommandPayload) {
  if (payload.entries.length !== 1) {
    return null;
  }
  return payload.entries[0]?.locator ?? null;
}

export function findExactLocatorHighlight(
  activeNodeId: string,
  nodesById: Record<string, Node>,
  locator: { from: number; originalText: string; to: number },
  trashedNodeIds: string[]
): LocatorHighlightMatch | null {
  const trashedNodeIdSet = new Set(trashedNodeIds);
  const matchingNode = Object.values(nodesById).find((node) => {
    if (
      node.parentNodeId !== activeNodeId ||
      trashedNodeIdSet.has(node.id) ||
      node.anchorLink?.kind !== 'highlight' ||
      !isTextAnchorLocator(node.anchorLink.locator)
    ) {
      return false;
    }
    const nodeLocator = node.anchorLink.locator;
    return (
      nodeLocator.from === locator.from &&
      nodeLocator.to === locator.to &&
      nodeLocator.originalText === locator.originalText
    );
  });
  return matchingNode ? { nodeId: matchingNode.id } : null;
}
