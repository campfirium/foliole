import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { getTextAnchorLocators, isTextAnchorLocator, type Node } from '../../features/nodes/model/nodeTypes';
import type { SelectionCommandPayload } from '../contextCommands';

export type NormalizedSelection = {
  from: number;
  to: number;
};

export type LocatorHighlightMatch = {
  originalText: string;
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
  if (!matchingNode || !matchingNode.anchorLink || !isTextAnchorLocator(matchingNode.anchorLink.locator)) {
    return null;
  }
  return { nodeId: matchingNode.id, originalText: matchingNode.anchorLink.locator.originalText };
}

export function findHighlightAtPosition(
  activeNodeId: string,
  nodesById: Record<string, Node>,
  position: number,
  trashedNodeIds: string[]
): LocatorHighlightMatch | null {
  const trashedNodeIdSet = new Set(trashedNodeIds);
  const matches = Object.values(nodesById).flatMap((node) => {
    if (
      node.parentNodeId !== activeNodeId ||
      trashedNodeIdSet.has(node.id) ||
      node.anchorLink?.kind !== 'highlight'
    ) {
      return [];
    }
    return getTextAnchorLocators(node.anchorLink.locator)
      .filter((locator) => locator.from <= position && position < locator.to)
      .map((locator) => ({ nodeId: node.id, originalText: locator.originalText }));
  });
  return matches.length === 1 ? matches[0] ?? null : null;
}
