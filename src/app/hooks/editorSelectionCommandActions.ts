import { formatHighlightCardContent } from '../../../lib/core/annotations/textAnnotationContent';
import { getHighlightAnnotationPrefix } from '../../features/editor/model/highlightAnnotationPrefixSetting';
import type { NodeAnchorLink, NodeImageRegionGroup } from '../../features/nodes/model/nodeTypes';
import { createSelectionAnnotationAnchorLink } from '../../shared/selectionAnnotationActions';
import type { SelectionCommandPayload } from '../contextCommands';

import { resolveLongClozeGuardAction, type LongClozeGuardOptions } from './editorClozeGuardrail';

function createHighlightFactory(
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    selectionText: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink,
    imageRegions?: NodeImageRegionGroup[] | null
  ) => Promise<string | null> | string | null
) {
  return (payload: SelectionCommandPayload) => {
    void createHighlightNodeFromSelection(
      payload.parentNodeId,
      payload.selectionText,
      payload.anchorId,
      createTextAnchorLink(payload, 'highlight'),
      payload.imageRegions
    );
    return null;
  };
}

function createAnnotatedHighlightFactory(
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    selectionText: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink,
    imageRegions?: NodeImageRegionGroup[] | null
  ) => Promise<string | null> | string | null
) {
  return (payload: SelectionCommandPayload, note: string) => {
    void createHighlightNodeFromSelection(
      payload.parentNodeId,
      formatHighlightCardContent({ note, notePrefix: getHighlightAnnotationPrefix(), text: payload.selectionText }),
      payload.anchorId,
      createTextAnchorLink(payload, 'highlight'),
      payload.imageRegions
    );
    return null;
  };
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
  ) => Promise<string | null> | string | null;
  flushPendingEditorDraft: () => boolean;
  runSelectionCommand: (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => void;
  runSelectionCommandFromPayloadHandler: (args: {
    flushPendingEditorDraft: () => boolean;
    keepOpen?: boolean;
    onApplied: (payload: SelectionCommandPayload) => string | null;
    payload: SelectionCommandPayload;
  }) => string | null;
}) {
  const createClozeFromPayload = (payload: SelectionCommandPayload) => {
    void args.createQANodeFromSelection(
      payload.parentNodeId,
      payload.clozeContent,
      payload.selectionText,
      payload.anchorId,
      createTextAnchorLink(payload, 'cloze')
    );
    return null;
  };
  const applyClozeGuardrail = (payload: SelectionCommandPayload, options?: LongClozeGuardOptions, flushDraft = false) => {
    if (options?.skipGuard) {
      if (flushDraft) args.flushPendingEditorDraft();
      return createClozeFromPayload(payload);
    }
    const action = resolveLongClozeGuardAction(payload);
    if (action === 'remind') {
      options?.onRemind?.();
      return null;
    }
    if (action === 'highlight') {
      return args.createHighlightFromPayload(payload);
    }
    if (flushDraft) args.flushPendingEditorDraft();
    return createClozeFromPayload(payload);
  };

  return {
    handleCreateCloze(options?: LongClozeGuardOptions) {
      args.runSelectionCommand((payload) => {
        applyClozeGuardrail(payload, options, true);
      }, 'cloze');
    },
    handleCreateClozeFromPayload(payload: SelectionCommandPayload, options?: LongClozeGuardOptions) {
      return args.runSelectionCommandFromPayloadHandler({
        keepOpen: Boolean(options?.onRemind),
        flushPendingEditorDraft: args.flushPendingEditorDraft,
        onApplied: (appliedPayload) => applyClozeGuardrail(appliedPayload, options),
        payload
      });
    }
  };
}

function createHighlightHandlers(args: {
  createChildNode: (parentNodeId: string, content?: string) => Promise<string | null> | string | null;
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    selectionText: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink,
    imageRegions?: NodeImageRegionGroup[] | null
  ) => Promise<string | null> | string | null;
  flushPendingEditorDraft: () => boolean;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
  runSelectionCommand: (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => void;
  runSelectionCommandFromPayloadHandler: (args: {
    flushPendingEditorDraft: () => boolean;
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
        args.flushPendingEditorDraft();
        createNoteFromPayload(payload, normalizedNote);
      }, 'highlight');
    },
    handleCreateHighlightFromPayload(payload: SelectionCommandPayload) {
      return args.runSelectionCommandFromPayloadHandler({
        flushPendingEditorDraft: args.flushPendingEditorDraft,
        onApplied: createHighlight,
        payload
      });
    },
    handleCreateNoteFromPayload(payload: SelectionCommandPayload, note?: string) {
      return args.runSelectionCommandFromPayloadHandler({
        flushPendingEditorDraft: args.flushPendingEditorDraft,
        onApplied: (appliedPayload) => createNoteFromPayload(appliedPayload, note),
        payload
      });
    }
  };
}

export function createSelectionHandlers(args: {
  createChildNode: (parentNodeId: string, content?: string) => Promise<string | null> | string | null;
  createHighlightNodeFromSelection: (
    parentNodeId: string,
    selectionText: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink,
    imageRegions?: NodeImageRegionGroup[] | null
  ) => Promise<string | null> | string | null;
  createQANodeFromSelection: (
    parentNodeId: string,
    clozeContent: string,
    answer: string,
    anchorId: string,
    anchorLink?: NodeAnchorLink
  ) => Promise<string | null> | string | null;
  flushPendingEditorDraft: () => boolean;
  onExitImmersiveMode: () => void;
  onSelectNode: (nodeId: string) => void;
  runSelectionCommand: (onApplied: (payload: SelectionCommandPayload) => void, anchorKind: 'highlight' | 'cloze') => void;
  runSelectionCommandFromPayloadHandler: (args: {
    flushPendingEditorDraft: () => boolean;
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
  return createSelectionAnnotationAnchorLink(payload, kind);
}
