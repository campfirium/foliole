import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

import type { EditorAdapter, EditorScrollEvent } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';
import { definedProps } from '../../shared/lib/definedProps';
import type { NodeViewState } from '../../store/workspaceStore';

import {
  captureEditorNodeViewState,
  stagePendingNodeViewState,
  type PendingNodeViewStateMap
} from './useReadingProgressSyncSupport';

const READING_PROGRESS_DEBOUNCE_MS = 400;

declare global {
  interface Window {
    __folioleFlushReadingProgressBeforeClose?: () => Promise<boolean>;
  }
}

interface ReadingProgressEffectsOptions {
  activeNodeId: string | null;
  browseRootNodeId?: string;
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } | null } | null;
  isWorkspaceHydrated: boolean;
  lifecycleFlush: () => void;
  syncActiveNodeReadingProgress: (activeNodeIdOverride?: string | null) => void;
}

type ShouldSuppressReadingProgressCapture = () => boolean;
type ImmediateReadingProgressCaptureArgs = {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  getReadingPositionSelection?: () => { from: number; to: number } | null;
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } | null } | null;
  isImmersiveMode: boolean;
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  onProgrammaticScroll?: (nodeId: string) => void;
  pendingNodeViewByIdRef: MutableRefObject<PendingNodeViewStateMap>;
  shouldSuppressReadingProgressCapture?: ShouldSuppressReadingProgressCapture;
};

function isReadingPositionRestoreActive(
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } | null } | null
) {
  return Boolean(getReadingPositionSyncState?.());
}

// The desktop controller rebuilds callbacks and getters on every render. Effects below read
// them through this ref so they re-run only on real inputs; re-running per render would flush
// progress on every render and cancel a pending debounced save.
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function useReadingProgressEffects({
  activeNodeId,
  browseRootNodeId,
  isWorkspaceHydrated,
  lifecycleFlush,
  syncActiveNodeReadingProgress
}: ReadingProgressEffectsOptions) {
  const latest = useLatest({ lifecycleFlush, syncActiveNodeReadingProgress });
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return;
    }
    latest.current.syncActiveNodeReadingProgress(activeNodeId);
  }, [activeNodeId, browseRootNodeId, isWorkspaceHydrated, latest]);

  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return;
    }
    const flush = () => latest.current.lifecycleFlush();
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [isWorkspaceHydrated, latest]);
}

export function useReadingProgressCloseFlushRegistration(
  isWorkspaceHydrated: boolean,
  flushReadingProgressImmediately: () => Promise<boolean>
) {
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return;
    }
    window.__folioleFlushReadingProgressBeforeClose = flushReadingProgressImmediately;
    return () => {
      if (window.__folioleFlushReadingProgressBeforeClose === flushReadingProgressImmediately) {
        delete window.__folioleFlushReadingProgressBeforeClose;
      }
    };
  }, [flushReadingProgressImmediately, isWorkspaceHydrated]);
}

export function useReadingProgressLifecycle(args: {
  activeNodeId: string | null;
  browseRootNodeId?: string;
  flushReadingProgress: (activeNodeIdOverride?: string | null, captureNodeIdOverride?: string | null) => void;
  flushReadingProgressImmediately: () => Promise<boolean>;
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } | null } | null;
  isWorkspaceHydrated: boolean;
}) {
  const { flushReadingProgress, flushReadingProgressImmediately } = args;
  const lifecycleFlush = useCallback(() => {
    void flushReadingProgressImmediately();
  }, [flushReadingProgressImmediately]);
  const syncActiveNodeReadingProgress = useCallback(
    (activeNodeIdOverride?: string | null) => flushReadingProgress(activeNodeIdOverride, null),
    [flushReadingProgress]
  );

  useReadingProgressEffects({
    activeNodeId: args.activeNodeId,
    ...definedProps({ browseRootNodeId: args.browseRootNodeId }),
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    lifecycleFlush,
    syncActiveNodeReadingProgress,
    ...definedProps({ getReadingPositionSyncState: args.getReadingPositionSyncState })
  });
}

export function useImmediateReadingProgressCapture(args: ImmediateReadingProgressCaptureArgs) {
  const latest = useLatest(args);
  const { activeNodeId, isViewingTrashNode, isWorkspaceHydrated } = args;
  // The editor adapter is attached to the ref without a re-render, so read it on each render and
  // subscribe again only when the instance changes; the first render after it attaches subscribes.
  const editor = args.editorRef.current;
  useEffect(() => {
    if (!isWorkspaceHydrated || !activeNodeId || isViewingTrashNode || !editor) {
      return;
    }

    const nodeId = activeNodeId;
    const unsubscribe = editor.onScroll((event) => {
      const current = latest.current;
      if (event.userInitiated) captureImmediateReadingProgress(current);
      else if (!isReadingPositionRestoreActive(current.getReadingPositionSyncState)) current.onProgrammaticScroll?.(nodeId);
    });

    return unsubscribe;
  }, [activeNodeId, editor, isViewingTrashNode, isWorkspaceHydrated, latest]);
}

function isUserInitiatedEditorScroll(event: EditorScrollEvent) {
  return event.userInitiated;
}

function captureImmediateReadingProgress(args: ImmediateReadingProgressCaptureArgs) {
  if (
    isReadingPositionRestoreActive(args.getReadingPositionSyncState) ||
    args.shouldSuppressReadingProgressCapture?.()
  ) {
    return;
  }
  const captured = captureEditorNodeViewState(
    args.activeNodeId,
    args.getReadingPositionSelection,
    args.isImmersiveMode,
    args.isViewingTrashNode,
    args.editorRef,
    'user-scroll'
  );
  const staged = stagePendingNodeViewState({
    captured,
    nodeViewById: args.nodeViewById,
    pendingNodeViewByIdRef: args.pendingNodeViewByIdRef
  });
  if (!staged || !captured) {
    return;
  }
  pushDebugTrace('reading-progress.capture-scroll', {
    nodeId: captured.nodeId,
    scrollTop: captured.viewState.scrollTop,
    selection: captured.viewState.selection
  });
}

export function useDebouncedReadingProgressPersistence(args: {
  activeNodeId: string | null;
  flushReadingProgress: () => void;
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } | null } | null;
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  editorRef: MutableRefObject<EditorAdapter | null>;
  shouldSuppressReadingProgressCapture?: ShouldSuppressReadingProgressCapture;
}) {
  const latest = useLatest(args);
  const { activeNodeId, isViewingTrashNode, isWorkspaceHydrated } = args;
  // The editor adapter is attached to the ref without a re-render, so read it on each render and
  // subscribe again only when the instance changes; the first render after it attaches subscribes.
  const editor = args.editorRef.current;
  useEffect(() => {
    if (!isWorkspaceHydrated || !activeNodeId || isViewingTrashNode || !editor) {
      return;
    }

    let timeoutId: number | null = null;
    const unsubscribe = editor.onScroll((event) => {
      if (
        !isUserInitiatedEditorScroll(event) ||
        isReadingPositionRestoreActive(latest.current.getReadingPositionSyncState) ||
        latest.current.shouldSuppressReadingProgressCapture?.()
      ) {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        return;
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      pushDebugTrace('reading-progress.debounce-scheduled', {
        activeNodeId,
        delayMs: READING_PROGRESS_DEBOUNCE_MS
      });
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        pushDebugTrace('reading-progress.debounce-fired', {
          activeNodeId
        });
        latest.current.flushReadingProgress();
      }, READING_PROGRESS_DEBOUNCE_MS);
    });

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      unsubscribe();
    };
  }, [activeNodeId, editor, isViewingTrashNode, isWorkspaceHydrated, latest]);
}
