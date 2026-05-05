import type { MutableRefObject } from 'react';

import { formatHighlightCardContent } from '../../../lib/core/annotations/textAnnotationContent';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { NodeAnchorLink, NodeImageRegionGroup, TextAnchorLocator } from '../../features/nodes/model/nodeTypes';
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
    anchorLink?: NodeAnchorLink,
    imageRegions?: NodeImageRegionGroup[] | null
  ) => string | null
) {
  return (payload: SelectionCommandPayload) =>
    createHighlightNodeFromSelection(
      payload.parentNodeId,
      payload.selectionText,
      payload.anchorId,
      createTextAnchorLink(payload, 'highlight'),
      payload.imageRegions
    ) ?? null;
}

function createAnnotatedHighlightFactory(
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    selectionText: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink,
    imageRegions?: NodeImageRegionGroup[] | null
  ) => string | null
) {
  return (payload: SelectionCommandPayload, note: string) =>
    createHighlightNodeFromSelection(
      payload.parentNodeId,
      formatHighlightCardContent({ note, text: payload.selectionText }),
      payload.anchorId,
      createTextAnchorLink(payload, 'highlight'),
      payload.imageRegions
    ) ?? null;
}

function createNoteFromPayloadHandler(args: {
  createAnnotatedHighlight: (payload: SelectionCommandPayload, note: string) => string | null;
}) {
  return (payload: SelectionCommandPayload, note = '') => {
    return args.createAnnotatedHighlight(payload, note);
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
    anchorLink?: NodeAnchorLink,
    imageRegions?: NodeImageRegionGroup[] | null
  ) => string | null;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
  runSelectionCommand: (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => void;
  runSelectionCommandFromPayloadHandler: (args: {
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
  }) => string | null;
}) {
  const createHighlight = createHighlightFactory(args.createHighlightNodeFromSelection);
  const createAnnotatedHighlight = createAnnotatedHighlightFactory(args.createHighlightNodeFromSelection);
  const createNoteFromPayload = createNoteFromPayloadHandler({
    createAnnotatedHighlight
  });

  return {
    handleCreateNote(note: string) {
      args.runSelectionCommand((payload) => {
        const normalizedNote = note.trim();
        if (!normalizedNote) {
          return;
        }
        createNoteFromPayload(payload, normalizedNote);
      }, 'highlight');
    },
    handleCreateHighlightFromPayload(payload: SelectionCommandPayload) {
      return args.runSelectionCommandFromPayloadHandler({
        onApplied: createHighlight,
        payload
      });
    },
    handleCreateNoteFromPayload(payload: SelectionCommandPayload, note?: string) {
      return args.runSelectionCommandFromPayloadHandler({
        onApplied: (appliedPayload) => createNoteFromPayload(appliedPayload, note),
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
    anchorLink?: NodeAnchorLink,
    imageRegions?: NodeImageRegionGroup[] | null
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
    handleCreateNote: highlightHandlers.handleCreateNote,
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
