import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { hasInlineAnchorMarkup, stripAnchorBlocks } from '../../features/editor/model/anchorBlocks';
import {
  findOverlappingAnchorRecords,
  findAnchorRecord,
  getAnchorContentRange,
  getAnchorWrappedRange,
  type AnchorRecord
} from '../../features/editor/model/anchorRecords';
import { isTextAnchorLocator, type Node } from '../../features/nodes/model/nodeTypes';
import type { SelectionCommandPayload } from '../contextCommands';

function normalizeSelectionText(value: string) {
  return stripAnchorBlocks(value).replace(/\s+/g, ' ').trim();
}

function resolveSelectedText(content: string, selection: { from: number; to: number }, payload: SelectionCommandPayload) {
  const rawSelectedText = normalizeSelectionText(content.slice(selection.from, selection.to));
  if (rawSelectedText && !rawSelectedText.includes('<') && !rawSelectedText.includes('>')) {
    return rawSelectedText;
  }
  const payloadText = normalizeSelectionText(payload.selectionText);
  if (payloadText && !payloadText.includes('<') && !payloadText.includes('>')) {
    return payloadText;
  }
  return '';
}

function findMatchingHighlightNodeIds(
  activeNodeId: string,
  nodesById: Record<string, Node>,
  selectedText: string,
  trashedNodeIds: string[]
) {
  const trashedNodeIdSet = new Set(trashedNodeIds);
  return Object.values(nodesById)
    .filter(
      (node) =>
        node.parentNodeId === activeNodeId &&
        !trashedNodeIdSet.has(node.id) &&
        node.anchorLink?.kind === 'highlight' &&
        normalizeSelectionText(node.content) === selectedText
    )
    .map((node) => node.id);
}

function normalizeSelection(selection: EditorSelection) {
  return {
    from: Math.min(selection.from, selection.to),
    to: Math.max(selection.from, selection.to)
  };
}

function resolveSelection(editorRef: MutableRefObject<EditorAdapter | null>) {
  return editorRef.current?.getSelectionRanges().map(normalizeSelection).find((range) => range.from < range.to) ?? null;
}

function resolveHighlightSelection(block: AnchorRecord) {
  const wrappedRange = getAnchorWrappedRange(block);
  const contentRange = getAnchorContentRange(block);
  return {
    from: wrappedRange.from,
    to: wrappedRange.from + (contentRange.to - contentRange.from)
  };
}

function removeHighlightMarkup(
  editorRef: MutableRefObject<EditorAdapter | null>,
  block: AnchorRecord
) {
  const editor = editorRef.current;
  if (!editor) {
    return false;
  }
  const content = editor.getContent();
  const contentRange = getAnchorContentRange(block);
  const wrappedRange = getAnchorWrappedRange(block);
  const nextContent = content.slice(contentRange.from, contentRange.to);
  editor.replaceRange(wrappedRange.from, wrappedRange.to, nextContent);
  const nextSelection = resolveHighlightSelection(block);
  editor.setSelection(nextSelection);
  editor.setSelectionRanges([nextSelection]);
  return true;
}

function findOverlappingHighlightBlock(content: string, selection: { from: number; to: number }, selectedText: string) {
  const overlappingHighlightBlocks = findOverlappingAnchorRecords(content, selection, 'highlight');

  return overlappingHighlightBlocks.find(
    (entry) => selectedText && normalizeSelectionText(entry.text) === selectedText
  ) ?? (selectedText ? undefined : overlappingHighlightBlocks.length === 1 ? overlappingHighlightBlocks[0] : undefined);
}

function findFallbackHighlightBlock(
  activeNodeId: string,
  content: string,
  nodesById: Record<string, Node>,
  selectedText: string,
  trashedNodeIds: string[]
) {
  const matchingNodeIds = findMatchingHighlightNodeIds(activeNodeId, nodesById, selectedText, trashedNodeIds);
  if (matchingNodeIds.length !== 1) {
    return null;
  }
  const fallbackNode = nodesById[matchingNodeIds[0] ?? ''];
  if (!fallbackNode?.anchorLink || fallbackNode.anchorLink.kind !== 'highlight') {
    return null;
  }
  const fallbackBlock = findAnchorRecord(content, fallbackNode.anchorLink);
  return fallbackBlock
    ? {
        block: fallbackBlock,
        nodeId: fallbackNode.id
      }
    : null;
}

function findFallbackLocatorHighlight(
  activeNodeId: string,
  nodesById: Record<string, Node>,
  selection: { from: number; to: number },
  selectedText: string,
  trashedNodeIds: string[]
) {
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
    const locator = node.anchorLink.locator;
    return (
      locator.from === selection.from &&
      locator.to === selection.to &&
      locator.originalText === selectedText
    );
  });
  return matchingNode ? { nodeId: matchingNode.id } : null;
}

function resolveLocatorFirstHighlightMatch(
  activeNodeId: string,
  nodesById: Record<string, Node>,
  selection: { from: number; to: number },
  selectedText: string,
  trashedNodeIds: string[]
) {
  if (!selectedText) {
    return null;
  }
  return findFallbackLocatorHighlight(activeNodeId, nodesById, selection, selectedText, trashedNodeIds);
}

function hasOpaqueHighlightBlock(
  match: { nodeId: string } | { block: AnchorRecord; nodeId: string }
): match is { block: AnchorRecord; nodeId: string } {
  return 'block' in match;
}

function resolveExistingHighlightMatch(
  activeNodeId: string | null,
  payload: SelectionCommandPayload,
  editorRef: MutableRefObject<EditorAdapter | null>,
  nodesById: Record<string, Node>,
  trashedNodeIds: string[]
) {
  if (!activeNodeId || !editorRef.current) {
    return null;
  }
  const selection = resolveSelection(editorRef);
  if (!selection) {
    return null;
  }
  const content = editorRef.current.getContent();
  const selectedText = resolveSelectedText(content, selection, payload);
  const locatorMatch = resolveLocatorFirstHighlightMatch(
    activeNodeId,
    nodesById,
    selection,
    selectedText,
    trashedNodeIds
  );
  if (locatorMatch) {
    return locatorMatch;
  }
  if (!hasInlineAnchorMarkup(content)) {
    return null;
  }
  const block = findOverlappingHighlightBlock(content, selection, selectedText);
  if (!block) {
    if (!selectedText) {
      return null;
    }
    return (
      findFallbackHighlightBlock(activeNodeId, content, nodesById, selectedText, trashedNodeIds) ??
      null
    );
  }
  const matchingNode = Object.values(nodesById).find(
      (node) =>
        node.parentNodeId === activeNodeId &&
        !trashedNodeIds.includes(node.id) &&
        node.anchorLink?.kind === 'highlight' &&
        node.anchorLink.id === block.id
    );
  return matchingNode
    ? {
        block,
        nodeId: matchingNode.id
      }
    : null;
}

export function createToggleSelectionHighlightFromPayloadHandler(args: {
  activeNodeId: string | null;
  createHighlightFromPayload: (payload: SelectionCommandPayload) => string | null;
  deleteNodePermanently: (nodeId: string) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  nodesById: Record<string, Node>;
  syncActiveNodeContentFromEditor: () => void;
  trashedNodeIds: string[];
}) {
  return (payload: SelectionCommandPayload) => {
    const existingHighlightMatch = resolveExistingHighlightMatch(
      args.activeNodeId,
      payload,
      args.editorRef,
      args.nodesById,
      args.trashedNodeIds
    );
    if (existingHighlightMatch) {
      if (hasOpaqueHighlightBlock(existingHighlightMatch)) {
        if (!removeHighlightMarkup(args.editorRef, existingHighlightMatch.block)) {
          return null;
        }
        args.syncActiveNodeContentFromEditor();
      }
      args.deleteNodePermanently(existingHighlightMatch.nodeId);
      return 'deleted' as const;
    }
    return args.createHighlightFromPayload(payload) ? 'created' as const : null;
  };
}
