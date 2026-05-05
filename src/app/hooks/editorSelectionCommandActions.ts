import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { applySelectionMarkup, type CommandMarkupType, type SelectionCommandPayload } from '../contextCommands';

export function runSelectionCommandFromPayload(args: {
  closeContextMenu?: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  onApplied: (payload: SelectionCommandPayload) => string | null;
  payload: SelectionCommandPayload;
  syncActiveNodeContentFromEditor: () => void;
  type: CommandMarkupType;
}) {
  const applied = applySelectionMarkup(args.editorRef.current, args.type, args.payload.entries);
  if (!applied) {
    args.closeContextMenu?.();
    return null;
  }
  args.syncActiveNodeContentFromEditor();
  const createdNodeId = args.onApplied(args.payload);
  args.closeContextMenu?.();
  return createdNodeId;
}

function createHighlightFactory(
  createHighlightNodeFromSelection: (parentNodeId: string, selectionText: string, anchorId: string) => string | null
) {
  return (payload: SelectionCommandPayload) =>
    createHighlightNodeFromSelection(payload.parentNodeId, payload.selectionText, payload.anchorId) ?? null;
}

function createNoteFromPayloadHandler(args: {
  createChildNode: (parentNodeId: string, content?: string) => string;
  createHighlight: (payload: SelectionCommandPayload) => string | null;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
}) {
  return (payload: SelectionCommandPayload) => {
    const highlightNodeId = args.createHighlight(payload);
    if (!highlightNodeId) {
      return null;
    }
    const noteNodeId = args.createChildNode(highlightNodeId, '');
    args.onExitImmersiveMode();
    args.onSelectNode(noteNodeId);
    return noteNodeId;
  };
}

function createClozeHandlers(args: {
  createQANodeFromSelection: (
    parentNodeId: string,
    clozeContent: string,
    answer: string,
    anchorId: string
  ) => string | null;
  runSelectionCommand: (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => void;
  runSelectionCommandFromPayloadHandler: (args: {
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
    type: CommandMarkupType;
  }) => string | null;
}) {
  return {
    handleCreateCloze() {
      args.runSelectionCommand((payload) => {
        args.createQANodeFromSelection(payload.parentNodeId, payload.clozeContent, payload.selectionText, payload.anchorId);
      }, 'cloze');
    },
    handleCreateClozeFromPayload(payload: SelectionCommandPayload) {
      return args.runSelectionCommandFromPayloadHandler({
        onApplied: () => {
          args.createQANodeFromSelection(payload.parentNodeId, payload.clozeContent, payload.selectionText, payload.anchorId);
          return null;
        },
        payload,
        type: 'cloze'
      });
    }
  };
}

function createHighlightHandlers(args: {
  createChildNode: (parentNodeId: string, content?: string) => string;
  createHighlightNodeFromSelection: (parentNodeId: string, selectionText: string, anchorId: string) => string | null;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
  runSelectionCommandFromPayloadHandler: (args: {
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
    type: CommandMarkupType;
  }) => string | null;
}) {
  const createHighlight = createHighlightFactory(args.createHighlightNodeFromSelection);
  const createNoteFromPayload = createNoteFromPayloadHandler({
    createChildNode: args.createChildNode,
    createHighlight,
    onExitImmersiveMode: args.onExitImmersiveMode,
    onSelectNode: args.onSelectNode
  });

  return {
    handleCreateHighlightFromPayload(payload: SelectionCommandPayload) {
      return args.runSelectionCommandFromPayloadHandler({
        onApplied: createHighlight,
        payload,
        type: 'highlight'
      });
    },
    handleCreateNoteFromPayload(payload: SelectionCommandPayload) {
      return args.runSelectionCommandFromPayloadHandler({
        onApplied: createNoteFromPayload,
        payload,
        type: 'highlight'
      });
    }
  };
}

export function createSelectionHandlers(args: {
  createChildNode: (parentNodeId: string, content?: string) => string;
  createHighlightNodeFromSelection: (parentNodeId: string, selectionText: string, anchorId: string) => string | null;
  createQANodeFromSelection: (
    parentNodeId: string,
    clozeContent: string,
    answer: string,
    anchorId: string
  ) => string | null;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
  runSelectionCommand: (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => void;
  runSelectionCommandFromPayloadHandler: (args: {
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
    type: CommandMarkupType;
  }) => string | null;
}) {
  const clozeHandlers = createClozeHandlers(args);
  const highlightHandlers = createHighlightHandlers(args);

  return {
    ...clozeHandlers,
    handleCreateHighlight() {
      args.runSelectionCommand((payload) => {
        highlightHandlers.handleCreateHighlightFromPayload(payload);
      }, 'highlight');
    },
    handleCreateHighlightFromPayload: highlightHandlers.handleCreateHighlightFromPayload,
    handleCreateNoteFromPayload: highlightHandlers.handleCreateNoteFromPayload
  };
}
