import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { NodeAnchorLink, TextAnchorLocator } from '../../features/nodes/model/nodeTypes';
import type { SelectionCommandPayload } from '../contextCommands';

export function runSelectionCommandFromPayload(args: {
  closeContextMenu?: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  onApplied: (payload: SelectionCommandPayload) => string | null;
  payload: SelectionCommandPayload;
}) {
  if (!args.editorRef.current || args.payload.entries.length === 0) {
    args.closeContextMenu?.();
    return null;
  }
  const createdNodeId = args.onApplied(args.payload);
  args.closeContextMenu?.();
  return createdNodeId;
}

function createHighlightFactory(
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    selectionText: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink
  ) => string | null
) {
  return (payload: SelectionCommandPayload) =>
    createHighlightNodeFromSelection(
      payload.parentNodeId,
      payload.selectionText,
      payload.anchorId,
      createTextAnchorLink(payload, 'highlight')
    ) ?? null;
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
    anchorId: string,
    anchorLink?: NodeAnchorLink
  ) => string | null;
  runSelectionCommand: (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => void;
  runSelectionCommandFromPayloadHandler: (args: {
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
  }) => string | null;
}) {
  return {
    handleCreateCloze() {
      args.runSelectionCommand((payload) => {
        args.createQANodeFromSelection(
          payload.parentNodeId,
          payload.clozeContent,
          payload.selectionText,
          payload.anchorId,
          createTextAnchorLink(payload, 'cloze')
        );
      }, 'cloze');
    },
    handleCreateClozeFromPayload(payload: SelectionCommandPayload) {
      return args.runSelectionCommandFromPayloadHandler({
        onApplied: () => {
          args.createQANodeFromSelection(
            payload.parentNodeId,
            payload.clozeContent,
            payload.selectionText,
            payload.anchorId,
            createTextAnchorLink(payload, 'cloze')
          );
          return null;
        },
        payload
      });
    }
  };
}

function createHighlightHandlers(args: {
  createChildNode: (parentNodeId: string, content?: string) => string;
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    selectionText: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink
  ) => string | null;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
  runSelectionCommandFromPayloadHandler: (args: {
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
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
        payload
      });
    },
    handleCreateNoteFromPayload(payload: SelectionCommandPayload) {
      return args.runSelectionCommandFromPayloadHandler({
        onApplied: createNoteFromPayload,
        payload
      });
    }
  };
}

export function createSelectionHandlers(args: {
  createChildNode: (parentNodeId: string, content?: string) => string;
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    selectionText: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink
  ) => string | null;
  createQANodeFromSelection: (
    parentNodeId: string,
    clozeContent: string,
    answer: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink
  ) => string | null;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
  runSelectionCommand: (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => void;
  runSelectionCommandFromPayloadHandler: (args: {
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
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

function createTextAnchorLink(payload: SelectionCommandPayload, kind: 'highlight' | 'cloze'): NodeAnchorLink | undefined {
  const locators = payload.entries.map((entry) => entry.locator).filter(Boolean) as TextAnchorLocator[];
  if (locators.length === 0) {
    return undefined;
  }
  const locator = locators.length === 1
    ? locators[0]
    : { ranges: locators };
  if (!locator) {
    return undefined;
  }
  return {
    id: payload.anchorId,
    kind,
    locator
  };
}
