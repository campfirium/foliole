import type { MutableRefObject } from 'react';

import { appendHighlightCardNote } from '../../../lib/core/annotations/textAnnotationContent';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getHighlightAnnotationPrefix } from '../../features/editor/model/highlightAnnotationPrefixSetting';
import type { Node } from '../../features/nodes/model/nodeTypes';
import type { SelectionCommandPayload } from '../contextCommands';

import {
  findExactLocatorHighlight,
  findPayloadEntryLocator,
  resolveSelection,
  type LocatorHighlightMatch,
  type NormalizedSelection
} from './selectionHighlightToggleSupport';

function normalizeSelectionText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function resolveSelectedText(
  content: string,
  selection: NormalizedSelection,
  payload: SelectionCommandPayload
) {
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

function resolveLocatorHighlightMatch(
  activeNodeId: string,
  payload: SelectionCommandPayload,
  nodesById: Record<string, Node>,
  selection: NormalizedSelection,
  selectedText: string,
  trashedNodeIds: string[]
): LocatorHighlightMatch | null {
  const payloadLocator = findPayloadEntryLocator(payload);
  if (payloadLocator) {
    return findExactLocatorHighlight(activeNodeId, nodesById, payloadLocator, trashedNodeIds);
  }
  if (!selectedText) {
    return null;
  }
  return findExactLocatorHighlight(
    activeNodeId,
    nodesById,
    {
      from: selection.from,
      originalText: selectedText,
      to: selection.to
    },
    trashedNodeIds
  );
}

function resolveEditorSelectionContext(
  payload: SelectionCommandPayload,
  editorRef: MutableRefObject<EditorAdapter | null>
) {
  if (!editorRef.current) {
    return null;
  }
  const selection = resolveSelection(editorRef);
  if (!selection) {
    return null;
  }
  const content = editorRef.current.getContent();
  return {
    content,
    selectedText: resolveSelectedText(content, selection, payload),
    selection
  };
}

export function resolveExistingHighlightMatch(
  activeNodeId: string | null,
  payload: SelectionCommandPayload,
  editorRef: MutableRefObject<EditorAdapter | null>,
  nodesById: Record<string, Node>,
  trashedNodeIds: string[]
): LocatorHighlightMatch | null {
  if (!activeNodeId) {
    return null;
  }
  const selectionContext = resolveEditorSelectionContext(payload, editorRef);
  if (!selectionContext) {
    return null;
  }
  const locatorMatch = resolveLocatorHighlightMatch(
    activeNodeId,
    payload,
    nodesById,
    selectionContext.selection,
    selectionContext.selectedText,
    trashedNodeIds
  );
  return locatorMatch;
}

export function createAddNoteToSelectionHighlightFromPayloadHandler(args: {
  activeNodeId: string | null;
  createHighlightFromPayload: (payload: SelectionCommandPayload, note?: string) => string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushPendingEditorDraft: () => boolean;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
  trashedNodeIds: string[];
  updateNodeContent: (nodeId: string, content: string) => void;
}) {
  return (payload: SelectionCommandPayload, note = '') => {
    const existingHighlightMatch = resolveExistingHighlightMatch(
      args.activeNodeId,
      payload,
      args.editorRef,
      args.nodesById,
      args.trashedNodeIds
    );
    if (!existingHighlightMatch) {
      return args.createHighlightFromPayload(payload, note);
    }
    const node = args.nodesById[existingHighlightMatch.nodeId];
    if (!node) {
      return null;
    }
    args.flushPendingEditorDraft();
    args.updateNodeContent(existingHighlightMatch.nodeId, appendHighlightCardNote({
      content: node.content,
      note,
      notePrefix: getHighlightAnnotationPrefix(),
      originalText: existingHighlightMatch.originalText
    }));
    args.onSelectNode(existingHighlightMatch.nodeId);
    return existingHighlightMatch.nodeId;
  };
}

export function createToggleSelectionHighlightFromPayloadHandler(args: {
  activeNodeId: string | null;
  createHighlightFromPayload: (payload: SelectionCommandPayload) => string | null;
  deleteEditorAnnotationNodes: (nodeIds: string[]) => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  flushPendingEditorDraft: () => boolean;
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
      args.flushPendingEditorDraft();
      args.deleteEditorAnnotationNodes([existingHighlightMatch.nodeId]);
      return 'deleted' as const;
    }
    return args.createHighlightFromPayload(payload) ? 'created' as const : null;
  };
}
