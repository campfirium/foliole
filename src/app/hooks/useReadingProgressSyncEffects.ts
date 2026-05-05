import { useEffect, useMemo, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/testing/debugBridge';
import type { NodeViewState } from '../../store/workspaceStore';

import { captureEditorNodeViewState, isSameNodeViewState } from './useReadingProgressSyncSupport';

const READING_PROGRESS_SYNC_INTERVAL_MS = 1500;
const READING_PROGRESS_DEBOUNCE_MS = 400;

interface ReadingProgressEffectsOptions {
  activeNodeId: string | null;
  flushReadingProgress: () => void;
  isWorkspaceHydrated: boolean;
  lifecycleFlush: () => void;
  syncActiveNodeReadingProgress: (activeNodeIdOverride?: string | null) => void;
}

function useReadingProgressEffects({
  activeNodeId,
  flushReadingProgress,
  isWorkspaceHydrated,
  lifecycleFlush,
  syncActiveNodeReadingProgress
}: ReadingProgressEffectsOptions) {
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return;
    }
    const timer = window.setInterval(() => {
      flushReadingProgress();
    }, READING_PROGRESS_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [flushReadingProgress, isWorkspaceHydrated]);

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

export function useCloseBridgeRegistration(
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
    flushReadingProgress: () => args.flushReadingProgress(),
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    lifecycleFlush,
    syncActiveNodeReadingProgress: (activeNodeIdOverride) =>
      args.flushReadingProgress(activeNodeIdOverride, null)
  });
}

export function useImmediateReadingProgressCapture(args: {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  getReadingPositionSelection?: () => { from: number; to: number } | null;
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}) {
  useEffect(() => {
    if (!args.isWorkspaceHydrated || !args.activeNodeId || args.isViewingTrashNode || !args.editorRef.current) {
      return;
    }

    const unsubscribe = args.editorRef.current.onScroll(() => {
      const captured = captureEditorNodeViewState(
        args.activeNodeId,
        args.getReadingPositionSelection,
        args.isViewingTrashNode,
        args.editorRef
      );
      if (!captured || isSameNodeViewState(args.nodeViewById[captured.nodeId], captured.viewState)) {
        return;
      }
      pushDebugTrace('reading-progress.capture-scroll', {
        nodeId: captured.nodeId,
        scrollTop: captured.viewState.scrollTop,
        selection: captured.viewState.selection
      });
      args.setNodeViewState(captured.nodeId, captured.viewState);
    });

    return unsubscribe;
  }, [
    args.activeNodeId,
    args.editorRef,
    args.getReadingPositionSelection,
    args.isViewingTrashNode,
    args.isWorkspaceHydrated,
    args.nodeViewById,
    args.setNodeViewState
  ]);
}

export function useDebouncedReadingProgressPersistence(args: {
  activeNodeId: string | null;
  flushReadingProgress: () => void;
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  editorRef: MutableRefObject<EditorAdapter | null>;
}) {
  useEffect(() => {
    if (!args.isWorkspaceHydrated || !args.activeNodeId || args.isViewingTrashNode || !args.editorRef.current) {
      return;
    }

    let timeoutId: number | null = null;
    const unsubscribe = args.editorRef.current.onScroll(() => {
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
  }, [args.activeNodeId, args.editorRef, args.flushReadingProgress, args.isViewingTrashNode, args.isWorkspaceHydrated]);
}
