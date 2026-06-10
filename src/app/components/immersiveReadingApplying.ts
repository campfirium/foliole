import type { MutableRefObject } from 'react';

import type { EditorAdapter, EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';
import type { NodeViewState } from '../../store/workspaceStore';
import type { ReadingPositionSyncState } from '../hooks/useAppRuntime';

import { getViewportReadingSelection, syncParagraphMarkerToReadingPosition } from './immersiveReadingMarker';

const APPLYING_READING_POSITION_TIMEOUT_MS = 500;
const IMMERSIVE_READING_ANCHOR_RATIO = 0.15;
const IMMERSIVE_READING_CHECK_START_DELAY_FRAMES = 2;
const IMMERSIVE_READING_MAX_CHECK_ATTEMPTS = 12;

interface ApplyingSelectionStateSource {
  getReadingPositionSyncState: () => ReadingPositionSyncState | null;
}

interface ApplyingViewportSource extends ApplyingSelectionStateSource {
  activeNodeId: string | null;
  completeApplyingReadingPosition: (reason: string, selection?: EditorSelection) => void;
  editorAdapterRef: MutableRefObject<EditorAdapter | null>;
}

interface ApplyingEntrySource extends ApplyingViewportSource {
  editorNodeViewState?: NodeViewState | undefined;
  getReadingPositionSelection: () => EditorSelection | null;
  isImmersiveMode: boolean;
}

export function getCurrentApplyingSelection(props: ApplyingSelectionStateSource) {
  return props.getReadingPositionSyncState()?.targetSelection ?? null;
}

export function isApplyingReadingPosition(props: ApplyingSelectionStateSource) {
  return props.getReadingPositionSyncState() !== null;
}

function completeApplyingFromViewport(
  props: ApplyingViewportSource,
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void,
  reason: string
) {
  const applyingSelection = getCurrentApplyingSelection(props);
  if (applyingSelection) {
    setReadingSelection(applyingSelection, 'applying-target');
    props.completeApplyingReadingPosition(reason);
    return;
  }
  const viewportSelection = getViewportReadingSelection(props);
  if (viewportSelection) {
    setReadingSelection(viewportSelection, 'applying-viewport-fallback');
  }
  props.completeApplyingReadingPosition(reason);
}

export function applyImmersiveEntrySelection(args: {
  clearPendingSelection: () => void;
  props: ApplyingEntrySource;
  remainingAttempts: number;
  scheduleRetry: () => void;
  selection: { from: number; to: number };
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void;
  shouldSkipNextScrollSyncRef: MutableRefObject<boolean>;
}) {
  const editor = args.props.editorAdapterRef.current;
  if (!editor) {
    if (args.remainingAttempts <= 0) {
      completeApplyingFromViewport(args.props, args.setReadingSelection, 'apply-timeout-missing-editor');
      pushDebugTrace('immersive.entry-selection.aborted-missing-editor', {
        selection: args.selection
      });
      return;
    }
    args.scheduleRetry();
    return;
  }
  const scrollMetrics = editor.getScrollMetrics?.();
  const viewportRect = editor.getViewportRect?.();
  const hasReadyViewport =
    (scrollMetrics ? scrollMetrics.clientHeight > 0 && scrollMetrics.scrollHeight > 0 : false) ||
    (viewportRect ? viewportRect.height > 0 : false);
  if (!hasReadyViewport) {
    if (args.remainingAttempts <= 0) {
      completeApplyingFromViewport(args.props, args.setReadingSelection, 'apply-timeout-editor-not-ready');
      pushDebugTrace('immersive.entry-selection.aborted-editor-not-ready', {
        selection: args.selection
      });
      return;
    }
    args.scheduleRetry();
    return;
  }
  args.setReadingSelection(args.selection, 'immersive-entry-apply');
  editor.setSelection(args.selection);
  args.shouldSkipNextScrollSyncRef.current = true;
  revealImmersiveEntrySelection(args.props, editor, args.selection, args.setReadingSelection, args.shouldSkipNextScrollSyncRef);
  pushDebugTrace('immersive.entry-selection.applied', {
    isImmersiveMode: args.props.isImmersiveMode,
    selection: args.selection
  });
  if (args.props.isImmersiveMode) {
    syncParagraphMarkerToReadingPosition(args.props);
  } else {
    args.props.editorAdapterRef.current?.setParagraphMarker?.(null);
  }
  args.clearPendingSelection();
}

function revealImmersiveEntrySelection(
  props: ApplyingViewportSource,
  editor: EditorAdapter,
  selection: { from: number; to: number },
  setReadingSelection: (selection: { from: number; to: number }, source?: string) => void,
  shouldSkipNextScrollSyncRef: MutableRefObject<boolean>
) {
  let remainingAttempts = IMMERSIVE_READING_MAX_CHECK_ATTEMPTS;
  const deadline = Date.now() + APPLYING_READING_POSITION_TIMEOUT_MS;

  const runFollowupCheck = () => {
    if (isSelectionNearImmersiveAnchor(editor, selection)) {
      setReadingSelection(selection, 'immersive-entry-synced');
      props.completeApplyingReadingPosition('viewport-synced');
      return;
    }
    if (remainingAttempts <= 0 || Date.now() >= deadline) {
      completeApplyingFromViewport(props, setReadingSelection, 'viewport-sync-timeout');
      return;
    }
    remainingAttempts -= 1;
    window.requestAnimationFrame(runFollowupCheck);
  };

  revealSelectionAtAnchorRatio(editor, selection);
  shouldSkipNextScrollSyncRef.current = true;
  scheduleAfterFrames(IMMERSIVE_READING_CHECK_START_DELAY_FRAMES, runFollowupCheck);
}

function revealSelectionAtAnchorRatio(
  editor: EditorAdapter,
  selection: { from: number; to: number }
) {
  if (editor.revealSelectionAtViewportRatio) {
    editor.revealSelectionAtViewportRatio(selection, IMMERSIVE_READING_ANCHOR_RATIO);
    return;
  }
  editor.revealSelection(selection);
}

function isSelectionNearImmersiveAnchor(
  editor: EditorAdapter,
  selection: { from: number; to: number }
) {
  if (editor.isPositionNearViewportRatio) {
    return editor.isPositionNearViewportRatio(selection.from, IMMERSIVE_READING_ANCHOR_RATIO, 0.05);
  }
  const viewportSelection = getViewportReadingSelection({
    activeNodeId: null,
    editorAdapterRef: { current: editor }
  });
  return viewportSelection?.from === selection.from && viewportSelection.to === selection.to;
}

function scheduleAfterFrames(remainingFrames: number, callback: () => void) {
  if (remainingFrames <= 0) {
    window.requestAnimationFrame(callback);
    return;
  }
  window.requestAnimationFrame(() => {
    scheduleAfterFrames(remainingFrames - 1, callback);
  });
}
