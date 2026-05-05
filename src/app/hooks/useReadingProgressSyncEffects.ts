import { useEffect, useMemo, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/testing/debugBridge';
import type { NodeViewState } from '../../store/workspaceStore';

import {
  captureEditorNodeViewState,
  stagePendingNodeViewState,
  type PendingNodeViewStateMap
} from './useReadingProgressSyncSupport';

const READING_PROGRESS_SYNC_INTERVAL_MS = 1500;
const READING_PROGRESS_DEBOUNCE_MS = 400;

declare global {
  interface Window {
    __folioleFlushReadingProgressBeforeClose?: () => Promise<boolean>;
  }
}

interface ReadingProgressEffectsOptions {
  activeNodeId: string | null;
  flushReadingProgress: () => void;
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } } | null;
  isWorkspaceHydrated: boolean;
  lifecycleFlush: () => void;
  syncActiveNodeReadingProgress: (activeNodeIdOverride?: string | null) => void;
}

function isReadingPositionRestoreActive(
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } } | null
) {
  return Boolean(getReadingPositionSyncState?.());
}

function useReadingProgressEffects({
  activeNodeId,
  flushReadingProgress,
  getReadingPositionSyncState,
  isWorkspaceHydrated,
  lifecycleFlush,
  syncActiveNodeReadingProgress
}: ReadingProgressEffectsOptions) {
  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return;
    }
    const timer = window.setInterval(() => {
      if (isReadingPositionRestoreActive(getReadingPositionSyncState)) {
        return;
      }
      flushReadingProgress();
    }, READING_PROGRESS_SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [flushReadingProgress, getReadingPositionSyncState, isWorkspaceHydrated]);

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
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } } | null;
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
    getReadingPositionSyncState: args.getReadingPositionSyncState,
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
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } } | null;
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  pendingNodeViewByIdRef: MutableRefObject<PendingNodeViewStateMap>;
}) {
  useEffect(() => {
    if (!args.isWorkspaceHydrated || !args.activeNodeId || args.isViewingTrashNode || !args.editorRef.current) {
      return;
    }

    const unsubscribe = args.editorRef.current.onScroll(() => {
      if (isReadingPositionRestoreActive(args.getReadingPositionSyncState)) {
        return;
      }
      const captured = captureEditorNodeViewState(
        args.activeNodeId,
        args.getReadingPositionSelection,
        args.isViewingTrashNode,
        args.editorRef
      );
      if (
        !stagePendingNodeViewState({
          captured,
          nodeViewById: args.nodeViewById,
          pendingNodeViewByIdRef: args.pendingNodeViewByIdRef
        })
      ) {
        return;
      }
      pushDebugTrace('reading-progress.capture-scroll', {
        nodeId: captured.nodeId,
        scrollTop: captured.viewState.scrollTop,
        selection: captured.viewState.selection
      });
    });

    return unsubscribe;
  }, [
    args.activeNodeId,
    args.editorRef,
    args.getReadingPositionSelection,
    args.getReadingPositionSyncState,
    args.isViewingTrashNode,
    args.isWorkspaceHydrated,
    args.nodeViewById,
    args.pendingNodeViewByIdRef
  ]);
}

export function useDebouncedReadingProgressPersistence(args: {
  activeNodeId: string | null;
  flushReadingProgress: () => void;
  getReadingPositionSyncState?: () => { reason: string; startedAt: number; targetSelection: { from: number; to: number } } | null;
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
      if (isReadingPositionRestoreActive(args.getReadingPositionSyncState)) {
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
  }, [args.activeNodeId, args.editorRef, args.flushReadingProgress, args.getReadingPositionSyncState, args.isViewingTrashNode, args.isWorkspaceHydrated]);
}
