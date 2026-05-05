import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { ReadingPositionSyncState } from './useAppRuntime';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { pushDebugTrace } from '../../shared/testing/debugBridge';
import { toRuntimeNodeViewStates } from '../../store/workspaceReadingProgress';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';
import type { NodeViewState } from '../../store/workspaceStore';

interface ReadingProgressSyncOptions {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  getReadingPositionSelection?: () => { from: number; to: number } | null;
  getReadingPositionSyncState?: () => ReadingPositionSyncState | null;
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}

interface CapturedNodeViewState {
  nodeId: string;
  viewState: NodeViewState;
}

declare global {
  interface Window {
    __folioleFlushReadingProgressBeforeClose?: () => Promise<boolean>;
  }
}

const READING_PROGRESS_SYNC_INTERVAL_MS = 1500;
const READING_PROGRESS_DEBOUNCE_MS = 400;

function normalizeNodeViewState(viewState: NodeViewState): NodeViewState {
  return {
    scrollTop: Math.max(0, Math.trunc(viewState.scrollTop)),
    selection: {
      from: Math.max(0, Math.trunc(viewState.selection.from)),
      to: Math.max(0, Math.trunc(viewState.selection.to))
    }
  };
}

function isSameNodeViewState(left: NodeViewState | undefined, right: NodeViewState): boolean {
  if (!left) {
    return false;
  }
  return (
    left.scrollTop === right.scrollTop &&
    left.selection.from === right.selection.from &&
    left.selection.to === right.selection.to
  );
}

function createReadingProgressSignature(activeNodeId: string | null, nodeViewById: Record<string, NodeViewState | undefined>): string {
  return JSON.stringify({
    activeNodeId,
    nodeViewStates: toRuntimeNodeViewStates(nodeViewById)
  });
}

function captureEditorNodeViewState(
  nodeId: string | null,
  getReadingPositionSelection: (() => { from: number; to: number } | null) | undefined,
  isViewingTrashNode: boolean,
  editorRef: MutableRefObject<EditorAdapter | null>
): CapturedNodeViewState | null {
  if (isViewingTrashNode || !nodeId || !editorRef.current) {
    return null;
  }
  const readingSelection = getReadingPositionSelection?.();
  return {
    nodeId,
    viewState: normalizeNodeViewState({
      scrollTop: editorRef.current.getScrollTop(),
      selection: readingSelection ?? editorRef.current.getSelection()
    })
  };
}

function createReadingProgressPayload(
  activeNodeId: string | null,
  nodeViewById: Record<string, NodeViewState | undefined>
) {
  return {
    activeNodeId,
    nodeViewStates: toRuntimeNodeViewStates(nodeViewById),
    updatedAt: new Date().toISOString()
  };
}

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

interface ResolvedReadingProgressState {
  captured: CapturedNodeViewState | null;
  mergedNodeViewById: Record<string, NodeViewState | undefined>;
  resolvedActiveNodeId: string | null;
}

function useResolvedReadingProgressState(args: ReadingProgressSyncOptions) {
  return useCallback(
    (activeNodeIdOverride?: string | null, captureNodeIdOverride?: string | null): ResolvedReadingProgressState | null => {
      if (!args.isWorkspaceHydrated) {
        return null;
      }
      const shouldCaptureEditorState = captureNodeIdOverride !== null;
      const captureNodeId =
        typeof captureNodeIdOverride === 'undefined' ? args.activeNodeId : captureNodeIdOverride;
      const captured = shouldCaptureEditorState
        ? captureEditorNodeViewState(
            captureNodeId,
            args.getReadingPositionSelection,
            args.isViewingTrashNode,
            args.editorRef
          )
        : null;
      return {
        captured,
        mergedNodeViewById: captured
          ? {
              ...args.nodeViewById,
              [captured.nodeId]: captured.viewState
            }
          : args.nodeViewById,
        resolvedActiveNodeId:
          typeof activeNodeIdOverride === 'undefined' ? args.activeNodeId : activeNodeIdOverride
      };
    },
    [args]
  );
}

function updateCapturedNodeViewState(args: {
  captured: CapturedNodeViewState | null;
  nodeViewById: Record<string, NodeViewState | undefined>;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}) {
  if (!args.captured || isSameNodeViewState(args.nodeViewById[args.captured.nodeId], args.captured.viewState)) {
    return;
  }
  args.setNodeViewState(args.captured.nodeId, args.captured.viewState);
}

function useCloseBridgeRegistration(
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

function useReadingProgressLifecycle(args: {
  activeNodeId: string | null;
  flushReadingProgress: (activeNodeIdOverride?: string | null, captureNodeIdOverride?: string | null) => void;
  flushReadingProgressImmediately: () => Promise<boolean>;
  isWorkspaceHydrated: boolean;
}) {
  const lifecycleFlush = useMemo(() => () => {
    void args.flushReadingProgressImmediately();
  }, [args.flushReadingProgressImmediately]);
  useReadingProgressEffects({
    activeNodeId: args.activeNodeId,
    flushReadingProgress: () => args.flushReadingProgress(),
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    lifecycleFlush,
    syncActiveNodeReadingProgress: (activeNodeIdOverride) => args.flushReadingProgress(activeNodeIdOverride, null)
  });
}

function useImmediateReadingProgressCapture(args: ReadingProgressSyncOptions) {
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

function useDebouncedReadingProgressPersistence(args: {
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

export function useReadingProgressSync({
  activeNodeId,
  editorRef,
  getReadingPositionSelection,
  getReadingPositionSyncState,
  isViewingTrashNode,
  isWorkspaceHydrated,
  nodeViewById,
  setNodeViewState
}: ReadingProgressSyncOptions) {
  const lastSyncedSignatureRef = useRef<string | null>(null);
  const resolveCapturedReadingProgress = useResolvedReadingProgressState({
    activeNodeId,
    editorRef,
    getReadingPositionSelection,
    isViewingTrashNode,
    isWorkspaceHydrated,
    nodeViewById,
    setNodeViewState
  });

  const flushReadingProgress = useCallback(
    (activeNodeIdOverride?: string | null, captureNodeIdOverride?: string | null) => {
      const resolved = resolveCapturedReadingProgress(activeNodeIdOverride, captureNodeIdOverride);
      if (!resolved) {
        return;
      }
      updateCapturedNodeViewState({ captured: resolved.captured, nodeViewById, setNodeViewState });
      pushDebugTrace('reading-progress.flush-runtime', {
        activeNodeId: resolved.resolvedActiveNodeId,
        capturedNodeId: resolved.captured?.nodeId ?? null,
        nodeViewStateCount: Object.keys(resolved.mergedNodeViewById).length,
        reason: captureNodeIdOverride === null ? 'node-switch' : 'periodic'
      });
      if (captureNodeIdOverride === null && getReadingPositionSyncState?.()) {
        pushDebugTrace('reading-progress.flush-runtime-skipped', {
          activeNodeId: resolved.resolvedActiveNodeId,
          reason: 'node-switch-during-restore'
        });
        return;
      }
      const signature = createReadingProgressSignature(resolved.resolvedActiveNodeId, resolved.mergedNodeViewById);
      if (lastSyncedSignatureRef.current === signature) {
        return;
      }
      lastSyncedSignatureRef.current = signature;
      syncReadingProgressToRuntime(createReadingProgressPayload(resolved.resolvedActiveNodeId, resolved.mergedNodeViewById));
    },
    [getReadingPositionSyncState, nodeViewById, resolveCapturedReadingProgress, setNodeViewState]
  );

  const flushReadingProgressImmediately = useCallback(async () => {
    const resolved = resolveCapturedReadingProgress();
    const runtimeInvoke = getRuntimeInvoke();
    if (!resolved || !runtimeInvoke) {
      return false;
    }
    updateCapturedNodeViewState({ captured: resolved.captured, nodeViewById, setNodeViewState });
    pushDebugTrace('reading-progress.flush-close-bridge', {
      activeNodeId: resolved.resolvedActiveNodeId,
      capturedNodeId: resolved.captured?.nodeId ?? null,
      nodeViewStateCount: Object.keys(resolved.mergedNodeViewById).length
    });
    await runtimeInvoke(
      NATIVE_COMMANDS.saveReadingProgress,
      createReadingProgressPayload(resolved.resolvedActiveNodeId, resolved.mergedNodeViewById)
    );
    lastSyncedSignatureRef.current = createReadingProgressSignature(
      resolved.resolvedActiveNodeId,
      resolved.mergedNodeViewById
    );
    return true;
  }, [nodeViewById, resolveCapturedReadingProgress, setNodeViewState]);
  useCloseBridgeRegistration(isWorkspaceHydrated, flushReadingProgressImmediately);
  useReadingProgressLifecycle({
    activeNodeId,
    flushReadingProgress,
    flushReadingProgressImmediately,
    isWorkspaceHydrated
  });
  useImmediateReadingProgressCapture({
    activeNodeId,
    editorRef,
    getReadingPositionSelection,
    isViewingTrashNode,
    isWorkspaceHydrated,
    nodeViewById,
    setNodeViewState
  });
  useDebouncedReadingProgressPersistence({
    activeNodeId,
    editorRef,
    flushReadingProgress: () => flushReadingProgress(),
    isViewingTrashNode,
    isWorkspaceHydrated
  });
}
