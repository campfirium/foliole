import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorScrollEvent } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ReadingPositionSyncState } from '../hooks/useAppRuntime';

import { getCurrentApplyingSelection, isApplyingReadingPosition } from './immersiveReadingApplying';
import {
  getReadingPositionSelection,
  getViewportReadingSelection,
  syncParagraphMarkerToReadingPosition
} from './immersiveReadingMarker';
import { resolveCurrentParagraphSelection } from './immersiveReadingModel';

interface StoredReadingSelectionSource {
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
  editorNodeViewState?: NodeViewState | undefined;
  getReadingPositionSelection: () => EditorSelection | null;
  getReadingPositionSyncState: () => ReadingPositionSyncState | null;
}

interface ReadingSelectionCommitSource {
  getReadingPositionSyncState: () => ReadingPositionSyncState | null;
  setReadingPositionSelection: (selection: EditorSelection) => void;
}

interface ReadingSelectionCaptureSource extends ReadingSelectionCommitSource {
  activeNodeId: string | null;
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
}

interface ImmersiveScrollEventSource extends ReadingSelectionCaptureSource {
  getReadingPositionSelection: () => EditorSelection | null;
  isImmersiveMode: boolean;
}

export function resolveStoredReadingSelection(props: StoredReadingSelectionSource) {
  const applyingSelection = getCurrentApplyingSelection(props);
  if (applyingSelection) {
    return applyingSelection;
  }
  const runtimeSelection = props.getReadingPositionSelection();
  if (runtimeSelection) {
    return runtimeSelection;
  }
  const editor = props.editorAdapterRef.current;
  if (!editor) {
    return props.editorNodeViewState?.selection ?? null;
  }
  return getReadingPositionSelection(props, editor.getSelection());
}

export function shouldIgnoreWhitespaceViewportSample(
  editor: EditorAdapter,
  selection: EditorSelection
) {
  const currentSelection = editor.getSelection();
  if (currentSelection.from === currentSelection.to || selection.from !== selection.to) {
    return false;
  }
  const content = editor.getContent();
  const currentParagraph = resolveCurrentParagraphSelection(content, currentSelection);
  if (
    !currentParagraph ||
    currentParagraph.from !== currentSelection.from ||
    currentParagraph.to !== currentSelection.to
  ) {
    return false;
  }
  const sampledCharacter = content[selection.from] ?? '\n';
  if (sampledCharacter.trim().length === 0) {
    return true;
  }
  return selection.from < currentParagraph.from || selection.to > currentParagraph.to;
}

export function commitReadingSelectionUpdate(args: {
  props: ReadingSelectionCommitSource;
  readingSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
  selection: { from: number; to: number };
  source: string;
}) {
  const applyingSelection = getCurrentApplyingSelection(args.props);
  if (
    applyingSelection &&
    (applyingSelection.from !== args.selection.from || applyingSelection.to !== args.selection.to)
  ) {
    return false;
  }
  args.readingSelectionRef.current = args.selection;
  args.props.setReadingPositionSelection(args.selection);
  return true;
}

export function captureReadingSelection(args: {
  pendingSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
  props: ReadingSelectionCaptureSource;
  readingSelectionRef: MutableRefObject<{ from: number; to: number } | null>;
}) {
  const selection = getViewportReadingSelection(args.props);
  if (!selection) {
    return;
  }
  commitReadingSelectionUpdate({
    props: args.props,
    readingSelectionRef: args.readingSelectionRef,
    selection,
    source: 'capture-viewport'
  });
  args.pendingSelectionRef.current = selection;
}

export function handleImmersiveScrollSyncEvent(args: {
  editor: EditorAdapter;
  event: EditorScrollEvent;
  getReadingSelection: () => EditorSelection | null;
  props: ImmersiveScrollEventSource;
  setReadingSelection: (selection: EditorSelection, source?: string) => void;
  shouldSkipNextScrollSyncRef: MutableRefObject<boolean>;
}) {
  if (!args.event.userInitiated) {
    args.shouldSkipNextScrollSyncRef.current = false;
    return;
  }
  if (isApplyingReadingPosition(args.props)) {
    pushDebugTrace('immersive.scroll-sync.ignored-applying', {
      isImmersiveMode: args.props.isImmersiveMode,
      selection: getCurrentApplyingSelection(args.props)
    });
    return;
  }
  if (args.shouldSkipNextScrollSyncRef.current) {
    args.shouldSkipNextScrollSyncRef.current = false;
    return;
  }
  syncViewportReadingSelection(args);
}

function syncViewportReadingSelection(args: {
  editor: EditorAdapter;
  getReadingSelection: () => EditorSelection | null;
  props: ImmersiveScrollEventSource;
  setReadingSelection: (selection: EditorSelection, source?: string) => void;
}) {
  const selection = getViewportReadingSelection(args.props);
  if (!selection) {
    pushDebugTrace('immersive.scroll-sync.skip-missing-selection', {
      isImmersiveMode: args.props.isImmersiveMode
    });
    return;
  }
  const previousSelection = args.getReadingSelection();
  if (!previousSelection) {
    args.setReadingSelection(selection, 'scroll-sync');
    pushDebugTrace('immersive.scroll-sync.selection-initialized', {
      isImmersiveMode: args.props.isImmersiveMode,
      selection
    });
    args.editor.setSelection(selection);
    syncParagraphMarkerToReadingPosition(args.props);
    return;
  }
  if (!args.props.isImmersiveMode || (previousSelection.from === selection.from && previousSelection.to === selection.to)) {
    return;
  }
  if (shouldIgnoreWhitespaceViewportSample(args.editor, selection)) {
    pushDebugTrace('immersive.scroll-sync.ignored-whitespace-sample', {
      isImmersiveMode: args.props.isImmersiveMode,
      selection
    });
    return;
  }
  args.setReadingSelection(selection, 'scroll-sync');
  pushDebugTrace('immersive.scroll-sync.selection-updated', {
    isImmersiveMode: args.props.isImmersiveMode,
    previousSelection,
    selection
  });
  args.editor.setSelection(selection);
  syncParagraphMarkerToReadingPosition(args.props);
}
