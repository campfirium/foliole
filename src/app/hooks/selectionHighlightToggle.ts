import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import type { ParsedAnchorBlock } from '../../features/editor/model/anchorBlocks';
import { parseAnchorBlocks, stripAnchorBlocks } from '../../features/editor/model/anchorBlocks';
import type { Node } from '../../features/nodes/model/nodeTypes';
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

function resolveHighlightSelection(block: ParsedAnchorBlock) {
  return {
    from: block.from,
    to: block.from + (block.contentTo - block.contentFrom)
  };
}

function removeHighlightMarkup(
  editorRef: MutableRefObject<EditorAdapter | null>,
  block: ParsedAnchorBlock
) {
  const editor = editorRef.current;
  if (!editor) {
    return false;
  }
  const content = editor.getContent();
  const nextContent = content.slice(block.contentFrom, block.contentTo);
  editor.replaceRange(block.from, block.to, nextContent);
  const nextSelection = resolveHighlightSelection(block);
  editor.setSelection(nextSelection);
  editor.setSelectionRanges([nextSelection]);
  return true;
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
  const overlappingHighlightBlocks = parseAnchorBlocks(content).blocks.filter(
    (entry) => entry.kind === 'highlight' && selection.from < entry.to && selection.to > entry.from
  );
  const block =
    overlappingHighlightBlocks.find(
      (entry) => selectedText && normalizeSelectionText(content.slice(entry.contentFrom, entry.contentTo)) === selectedText
    ) ??
    (selectedText ? undefined : overlappingHighlightBlocks.length === 1 ? overlappingHighlightBlocks[0] : undefined);
  if (!block) {
    if (!selectedText) {
      return null;
    }
    const matchingNodeIds = findMatchingHighlightNodeIds(activeNodeId, nodesById, selectedText, trashedNodeIds);
    if (matchingNodeIds.length !== 1) {
      return null;
    }
    const fallbackNode = nodesById[matchingNodeIds[0] ?? ''];
    if (!fallbackNode?.anchorLink || fallbackNode.anchorLink.kind !== 'highlight') {
      return null;
    }
    const fallbackBlock = parseAnchorBlocks(content).blocks.find(
      (entry) => entry.kind === 'highlight' && entry.id === fallbackNode.anchorLink?.id
    );
    return fallbackBlock
      ? {
          block: fallbackBlock,
          nodeId: fallbackNode.id
        }
      : null;
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
      if (!removeHighlightMarkup(args.editorRef, existingHighlightMatch.block)) {
        return null;
      }
      args.syncActiveNodeContentFromEditor();
      args.deleteNodePermanently(existingHighlightMatch.nodeId);
      return 'deleted' as const;
    }
    return args.createHighlightFromPayload(payload) ? 'created' as const : null;
  };
}
