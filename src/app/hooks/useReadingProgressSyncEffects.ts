import { useEffect, useMemo, type MutableRefObject } from 'react';

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
  pendingNodeViewByIdRef: MutableRefObject<PendingNodeViewStateMap>;
  shouldSuppressReadingProgressCapture?: ShouldSuppressReadingProgressCapture;
};

function isReadingPositionRestoreActive(
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } | null } | null
) {
  return Boolean(getReadingPositionSyncState?.());
}

function useReadingProgressEffects({
  activeNodeId,
  isWorkspaceHydrated,
  lifecycleFlush,
  syncActiveNodeReadingProgress
}: ReadingProgressEffectsOptions) {
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return;
    }
    syncActiveNodeReadingProgress(activeNodeId);
  }, [activeNodeId, isWorkspaceHydrated, syncActiveNodeReadingProgress]);

  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return;
    }
    window.addEventListener('beforeunload', lifecycleFlush);
    window.addEventListener('pagehide', lifecycleFlush);
    return () => {
      window.removeEventListener('beforeunload', lifecycleFlush);
      window.removeEventListener('pagehide', lifecycleFlush);
    };
  }, [isWorkspaceHydrated, lifecycleFlush]);
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
  flushReadingProgress: (activeNodeIdOverride?: string | null, captureNodeIdOverride?: string | null) => void;
  flushReadingProgressImmediately: () => Promise<boolean>;
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } | null } | null;
  isWorkspaceHydrated: boolean;
}) {
  const lifecycleFlush = useMemo(
    () => () => {
      void args.flushReadingProgressImmediately();
    },
    [args.flushReadingProgressImmediately]
  );

  useReadingProgressEffects({
    activeNodeId: args.activeNodeId,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    lifecycleFlush,
    syncActiveNodeReadingProgress: (activeNodeIdOverride) =>
      args.flushReadingProgress(activeNodeIdOverride, null),
    ...definedProps({ getReadingPositionSyncState: args.getReadingPositionSyncState })
  });
}

export function useImmediateReadingProgressCapture(args: ImmediateReadingProgressCaptureArgs) {
  useEffect(() => {
    if (!args.isWorkspaceHydrated || !args.activeNodeId || args.isViewingTrashNode || !args.editorRef.current) {
      return;
    }

    const unsubscribe = args.editorRef.current.onScroll((event) => {
      captureImmediateReadingProgress(args, event);
    });

    return unsubscribe;
  }, [
    args.activeNodeId,
    args.editorRef,
    args.getReadingPositionSelection,
    args.getReadingPositionSyncState,
    args.isImmersiveMode,
    args.isViewingTrashNode,
    args.isWorkspaceHydrated,
    args.nodeViewById,
    args.pendingNodeViewByIdRef,
    args.shouldSuppressReadingProgressCapture
  ]);
}

function isUserInitiatedEditorScroll(event: EditorScrollEvent) {
  return event.userInitiated;
}

function captureImmediateReadingProgress(args: ImmediateReadingProgressCaptureArgs, event: EditorScrollEvent) {
  if (
    !isUserInitiatedEditorScroll(event) ||
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
  useEffect(() => {
    if (!args.isWorkspaceHydrated || !args.activeNodeId || args.isViewingTrashNode || !args.editorRef.current) {
      return;
    }

    let timeoutId: number | null = null;
    const unsubscribe = args.editorRef.current.onScroll((event) => {
      if (
        !isUserInitiatedEditorScroll(event) ||
        isReadingPositionRestoreActive(args.getReadingPositionSyncState) ||
        args.shouldSuppressReadingProgressCapture?.()
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
        activeNodeId: args.activeNodeId,
        delayMs: READING_PROGRESS_DEBOUNCE_MS
      });
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        pushDebugTrace('reading-progress.debounce-fired', {
          activeNodeId: args.activeNodeId
        });
        args.flushReadingProgress();
      }, READING_PROGRESS_DEBOUNCE_MS);
    });

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      unsubscribe();
    };
  }, [
    args.activeNodeId,
    args.editorRef,
    args.flushReadingProgress,
    args.getReadingPositionSyncState,
    args.isViewingTrashNode,
    args.isWorkspaceHydrated,
    args.shouldSuppressReadingProgressCapture
  ]);
}
