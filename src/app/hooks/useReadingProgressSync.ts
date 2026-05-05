import { useCallback, useRef, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { NodeViewState } from '../../store/workspaceStore';

import type { ReadingPositionSyncState } from './useAppRuntime';
import { useCloseBridgeRegistration, useDebouncedReadingProgressPersistence, useImmediateReadingProgressCapture, useReadingProgressLifecycle } from './useReadingProgressSyncEffects';
import {
  flushReadingProgressToCloseBridge,
  flushReadingProgressToRuntime,
  type ReadingProgressPersistenceArgs
} from './useReadingProgressSyncPersistence';
import {
  captureEditorNodeViewState,
  mergePendingNodeViewStates,
  type PendingNodeViewStateMap,
  type ResolvedReadingProgressState
} from './useReadingProgressSyncSupport';

export interface ReadingProgressSyncOptions {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  getReadingPositionSelection?: () => { from: number; to: number } | null;
  getReadingPositionSyncState?: () => ReadingPositionSyncState | null;
  isImmersiveMode: boolean;
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}

function useLatestReadingProgressState(args: ReadingProgressSyncOptions) {
  const activeNodeIdRef = useRef(args.activeNodeId);
  const isWorkspaceHydratedRef = useRef(args.isWorkspaceHydrated);
  const nodeViewByIdRef = useRef(args.nodeViewById);
  const pendingNodeViewByIdRef = useRef<PendingNodeViewStateMap>({});

  activeNodeIdRef.current = args.activeNodeId;
  isWorkspaceHydratedRef.current = args.isWorkspaceHydrated;
  nodeViewByIdRef.current = args.nodeViewById;

  return {
    activeNodeIdRef,
    isWorkspaceHydratedRef,
    nodeViewByIdRef,
    pendingNodeViewByIdRef
  };
}
function createReadingProgressOptions(args: ReadingProgressSyncOptions): ReadingProgressSyncOptions {
  return args;
}

function useResolvedReadingProgressState(
  args: ReadingProgressSyncOptions,
  latest: ReturnType<typeof useLatestReadingProgressState>
) {
  return useCallback(
    (activeNodeIdOverride?: string | null, captureNodeIdOverride?: string | null): ResolvedReadingProgressState | null => {
      if (!latest.isWorkspaceHydratedRef.current) {
        return null;
      }
      const shouldCaptureEditorState = captureNodeIdOverride !== null;
      const captureNodeId =
        typeof captureNodeIdOverride === 'undefined'
          ? latest.activeNodeIdRef.current
          : captureNodeIdOverride;
      const captured = shouldCaptureEditorState
        ? captureEditorNodeViewState(
            captureNodeId,
            args.getReadingPositionSelection,
            args.isImmersiveMode,
            args.isViewingTrashNode,
            args.editorRef
          )
        : null;
      const mergedPendingNodeViewById = mergePendingNodeViewStates(
        latest.nodeViewByIdRef.current,
        latest.pendingNodeViewByIdRef.current
      );
      return {
        captured,
        mergedNodeViewById: captured
          ? {
              ...mergedPendingNodeViewById,
              [captured.nodeId]: captured.viewState
            }
          : mergedPendingNodeViewById,
        resolvedActiveNodeId:
          typeof activeNodeIdOverride === 'undefined'
            ? latest.activeNodeIdRef.current
            : activeNodeIdOverride
      };
    },
    [args, latest]
  );
}

function useReadingProgressFlushCallbacks(args: {
  getReadingPositionSyncState?: () => ReadingPositionSyncState | null;
  isWorkspaceHydrated: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  pendingNodeViewByIdRef: MutableRefObject<PendingNodeViewStateMap>;
  resolveCapturedReadingProgress: (
    activeNodeIdOverride?: string | null,
    captureNodeIdOverride?: string | null
  ) => ResolvedReadingProgressState | null;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}) {
  const lastSyncedSignatureRef = useRef<string | null>(null);
  const persistence: ReadingProgressPersistenceArgs = args;

  const flushReadingProgress = useCallback(
    (activeNodeIdOverride?: string | null, captureNodeIdOverride?: string | null) =>
      flushReadingProgressToRuntime({
        activeNodeIdOverride,
        captureNodeIdOverride,
        lastSyncedSignatureRef,
        persistence
      }),
    [persistence]
  );

  const flushReadingProgressImmediately = useCallback(
    () =>
      flushReadingProgressToCloseBridge({
        lastSyncedSignatureRef,
        persistence
      }),
    [persistence]
  );

  return { flushReadingProgress, flushReadingProgressImmediately };
}

export function useReadingProgressSync({
  activeNodeId,
  editorRef,
  getReadingPositionSelection,
  getReadingPositionSyncState,
  isViewingTrashNode,
  isImmersiveMode,
  isWorkspaceHydrated,
  nodeViewById,
  setNodeViewState
}: ReadingProgressSyncOptions) {
  const options = createReadingProgressOptions({
    activeNodeId,
    editorRef,
    getReadingPositionSelection,
    getReadingPositionSyncState,
    isImmersiveMode,
    isViewingTrashNode,
    isWorkspaceHydrated,
    nodeViewById,
    setNodeViewState
  });
  const latest = useLatestReadingProgressState(options);
  const resolveCapturedReadingProgress = useResolvedReadingProgressState(options, latest);
  const { flushReadingProgress, flushReadingProgressImmediately } = useReadingProgressFlushCallbacks({
    getReadingPositionSyncState,
    isWorkspaceHydrated,
    nodeViewById,
    resolveCapturedReadingProgress,
    setNodeViewState,
    pendingNodeViewByIdRef: latest.pendingNodeViewByIdRef
  });
  useCloseBridgeRegistration(isWorkspaceHydrated, flushReadingProgressImmediately);
  useReadingProgressLifecycle({
    activeNodeId,
    flushReadingProgress,
    flushReadingProgressImmediately,
    getReadingPositionSyncState,
    isWorkspaceHydrated
  });
  useImmediateReadingProgressCapture({
    activeNodeId,
    editorRef,
    getReadingPositionSelection,
    getReadingPositionSyncState,
    isImmersiveMode,
    isViewingTrashNode,
    isWorkspaceHydrated,
    nodeViewById,
    pendingNodeViewByIdRef: latest.pendingNodeViewByIdRef
  });
  useDebouncedReadingProgressPersistence({
    activeNodeId,
    editorRef,
    flushReadingProgress: () => flushReadingProgress(),
    getReadingPositionSyncState,
    isViewingTrashNode,
    isWorkspaceHydrated
  });
}
