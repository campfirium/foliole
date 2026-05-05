import type { MutableRefObject } from 'react';

import { formatHighlightCardContent } from '../../../lib/core/annotations/textAnnotationContent';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getHighlightAnnotationPrefix } from '../../features/editor/model/highlightAnnotationPrefixSetting';
import type { NodeAnchorLink, NodeImageRegionGroup } from '../../features/nodes/model/nodeTypes';
import { createSelectionAnnotationAnchorLink } from '../../shared/selectionAnnotationActions';
import type { SelectionCommandPayload } from '../contextCommands';

import { resolveLongClozeGuardAction, type LongClozeGuardOptions } from './editorClozeGuardrail';

export function runSelectionCommandFromPayload(args: {
  closeContextMenu?: () => void;
  editorRef: MutableRefObject<EditorAdapter | null>;
  keepOpen?: boolean;
  onApplied: (payload: SelectionCommandPayload) => string | null;
  payload: SelectionCommandPayload;
}) {
  if (!args.editorRef.current || args.payload.entries.length === 0) {
    args.closeContextMenu?.();
    return null;
  }
  const createdNodeId = args.onApplied(args.payload);
  if (!args.keepOpen) {
    args.closeContextMenu?.();
  }
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
      formatHighlightCardContent({ note, notePrefix: getHighlightAnnotationPrefix(), text: payload.selectionText }),
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
  createHighlightFromPayload: (payload: SelectionCommandPayload) => string | null;
  createQANodeFromSelection: (
    parentNodeId: string,
    clozeContent: string,
    answer: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink
  ) => string | null;
  runSelectionCommand: (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => void;
  runSelectionCommandFromPayloadHandler: (args: {
    keepOpen?: boolean;
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
  }) => string | null;
}) {
  const createClozeFromPayload = (payload: SelectionCommandPayload) => {
    args.createQANodeFromSelection(
      payload.parentNodeId,
      payload.clozeContent,
      payload.selectionText,
      payload.anchorId,
      createTextAnchorLink(payload, 'cloze')
    );
    return null;
  };
  const applyClozeGuardrail = (payload: SelectionCommandPayload, options?: LongClozeGuardOptions) => {
    if (options?.skipGuard) {
      return createClozeFromPayload(payload);
    }
    const action = resolveLongClozeGuardAction(payload);
    if (action === 'remind') {
      options?.onRemind?.();
      return null;
    }
    return action === 'highlight' ? args.createHighlightFromPayload(payload) : createClozeFromPayload(payload);
  };

  return {
    handleCreateCloze(options?: LongClozeGuardOptions) {
      args.runSelectionCommand((payload) => {
        applyClozeGuardrail(payload, options);
      }, 'cloze');
    },
    handleCreateClozeFromPayload(payload: SelectionCommandPayload, options?: LongClozeGuardOptions) {
      return args.runSelectionCommandFromPayloadHandler({
        keepOpen: Boolean(options?.onRemind),
        onApplied: (appliedPayload) => applyClozeGuardrail(appliedPayload, options),
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
  const highlightHandlers = createHighlightHandlers(args);
  const clozeHandlers = createClozeHandlers({
    ...args,
    createHighlightFromPayload: highlightHandlers.handleCreateHighlightFromPayload
  });

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
  return createSelectionAnnotationAnchorLink(payload, kind) as NodeAnchorLink | undefined;
}
