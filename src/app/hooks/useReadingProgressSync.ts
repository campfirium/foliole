import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { toRuntimeNodeViewStates } from '../../store/workspaceReadingProgress';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';
import type { NodeViewState } from '../../store/workspaceStore';

interface ReadingProgressSyncOptions {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}

interface CapturedNodeViewState {
  nodeId: string;
  viewState: NodeViewState;
}

const READING_PROGRESS_SYNC_INTERVAL_MS = 1500;

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
  isViewingTrashNode: boolean,
  editorRef: MutableRefObject<EditorAdapter | null>
): CapturedNodeViewState | null {
  if (isViewingTrashNode || !nodeId || !editorRef.current) {
    return null;
  }
  return {
    nodeId,
    viewState: normalizeNodeViewState({
      scrollTop: editorRef.current.getScrollTop(),
      selection: editorRef.current.getSelection()
    })
  };
}

interface ReadingProgressEffectsOptions {
  activeNodeId: string | null;
  flushReadingProgress: (activeNodeIdOverride?: string | null) => void;
  isWorkspaceHydrated: boolean;
  lifecycleFlush: () => void;
}

function useReadingProgressEffects({
  activeNodeId,
  flushReadingProgress,
  isWorkspaceHydrated,
  lifecycleFlush
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
    flushReadingProgress(activeNodeId);
  }, [activeNodeId, flushReadingProgress, isWorkspaceHydrated]);

  useEffect(() => {
    if (!isWorkspaceHydrated) {
      return;
    }
    window.addEventListener('beforeunload', lifecycleFlush);
    window.addEventListener('pagehide', lifecycleFlush);
    return () => {
      lifecycleFlush();
      window.removeEventListener('beforeunload', lifecycleFlush);
      window.removeEventListener('pagehide', lifecycleFlush);
    };
  }, [isWorkspaceHydrated, lifecycleFlush]);
}

export function useReadingProgressSync({
  activeNodeId,
  editorRef,
  isViewingTrashNode,
  isWorkspaceHydrated,
  nodeViewById,
  setNodeViewState
}: ReadingProgressSyncOptions) {
  const lastSyncedSignatureRef = useRef<string | null>(null);

  const flushReadingProgress = useCallback(
    (activeNodeIdOverride?: string | null, captureNodeIdOverride?: string | null) => {
      if (!isWorkspaceHydrated) {
        return;
      }
      const shouldCaptureEditorState = captureNodeIdOverride !== null;
      const captureNodeId =
        typeof captureNodeIdOverride === 'undefined' ? activeNodeId : captureNodeIdOverride;
      const captured = shouldCaptureEditorState
        ? captureEditorNodeViewState(captureNodeId, isViewingTrashNode, editorRef)
        : null;
      const mergedNodeViewById = captured
        ? {
            ...nodeViewById,
            [captured.nodeId]: captured.viewState
          }
        : nodeViewById;

      if (captured && !isSameNodeViewState(nodeViewById[captured.nodeId], captured.viewState)) {
        setNodeViewState(captured.nodeId, captured.viewState);
      }

      const resolvedActiveNodeId =
        typeof activeNodeIdOverride === 'undefined' ? activeNodeId : activeNodeIdOverride;
      const signature = createReadingProgressSignature(resolvedActiveNodeId, mergedNodeViewById);
      if (lastSyncedSignatureRef.current === signature) {
        return;
      }
      lastSyncedSignatureRef.current = signature;

      syncReadingProgressToRuntime({
        activeNodeId: resolvedActiveNodeId,
        nodeViewStates: toRuntimeNodeViewStates(mergedNodeViewById),
        updatedAt: new Date().toISOString()
      });
    },
    [activeNodeId, editorRef, isViewingTrashNode, isWorkspaceHydrated, nodeViewById, setNodeViewState]
  );

  const lifecycleFlush = useMemo(() => () => flushReadingProgress(), [flushReadingProgress]);

  useReadingProgressEffects({
    activeNodeId,
    flushReadingProgress: (activeNodeIdOverride) => flushReadingProgress(activeNodeIdOverride, null),
    isWorkspaceHydrated,
    lifecycleFlush
  });
}
