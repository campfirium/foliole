import { useCallback, useRef, type MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { definedProps } from '../../shared/lib/definedProps';
import type { NodeViewState } from '../../store/workspaceStore';

import { resolveReadingProgressState } from './readingProgressStateResolver';
import type { ReadingPositionSyncState } from './useAppRuntime';
import { useReadingProgressCaptureHooks } from './useReadingProgressCaptureHooks';
import { useReadingProgressCloseFlushRegistration, useReadingProgressLifecycle } from './useReadingProgressSyncEffects';
import {
  flushReadingProgressBeforeClose,
  flushReadingProgressToRuntime,
  type ReadingProgressPersistenceArgs
} from './useReadingProgressSyncPersistence';
import {
  type PendingNodeViewStateMap,
  type ReadingProgressCaptureMode,
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

function useResolvedReadingProgressState(
  args: ReadingProgressSyncOptions,
  latest: ReturnType<typeof useLatestReadingProgressState>
) {
  return useCallback(
    (
      activeNodeIdOverride?: string | null,
      captureNodeIdOverride?: string | null,
      includePendingNodeViewStates = true,
      captureMode: ReadingProgressCaptureMode = 'snapshot'
    ): ResolvedReadingProgressState | null => {
      return resolveReadingProgressState({
        activeNodeIdOverride,
        activeNodeIdRef: latest.activeNodeIdRef,
        captureMode,
        captureNodeIdOverride,
        editorRef: args.editorRef,
        getReadingPositionSelection: args.getReadingPositionSelection,
        includePendingNodeViewStates,
        isImmersiveMode: args.isImmersiveMode,
        isViewingTrashNode: args.isViewingTrashNode,
        isWorkspaceHydratedRef: latest.isWorkspaceHydratedRef,
        nodeViewByIdRef: latest.nodeViewByIdRef,
        pendingNodeViewByIdRef: latest.pendingNodeViewByIdRef
      });
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
    captureNodeIdOverride?: string | null,
    includePendingNodeViewStates?: boolean,
    captureMode?: ReadingProgressCaptureMode
  ) => ResolvedReadingProgressState | null;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}) {
  const lastSyncedSignatureRef = useRef<string | null>(null);
  const persistence: ReadingProgressPersistenceArgs = args;

  const flushReadingProgress = useCallback(
    (activeNodeIdOverride?: string | null, captureNodeIdOverride?: string | null, captureMode?: ReadingProgressCaptureMode) =>
      flushReadingProgressToRuntime({
        lastSyncedSignatureRef,
        persistence,
        ...definedProps({
          activeNodeIdOverride,
          captureMode,
          captureNodeIdOverride
        })
      }),
    [persistence]
  );

  const flushReadingProgressImmediately = useCallback(
    () =>
      flushReadingProgressBeforeClose({
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
  const options = {
    activeNodeId,
    editorRef,
    isImmersiveMode,
    isViewingTrashNode,
    isWorkspaceHydrated,
    nodeViewById,
    setNodeViewState,
    ...definedProps({
      getReadingPositionSelection,
      getReadingPositionSyncState
    })
  };
  const latest = useLatestReadingProgressState(options);
  const resolveCapturedReadingProgress = useResolvedReadingProgressState(options, latest);
  const { flushReadingProgress, flushReadingProgressImmediately } = useReadingProgressFlushCallbacks({
    isWorkspaceHydrated,
    nodeViewById,
    resolveCapturedReadingProgress,
    setNodeViewState,
    pendingNodeViewByIdRef: latest.pendingNodeViewByIdRef,
    ...definedProps({ getReadingPositionSyncState })
  });
  useReadingProgressCloseFlushRegistration(isWorkspaceHydrated, flushReadingProgressImmediately);
  useReadingProgressLifecycle({
    activeNodeId,
    flushReadingProgress,
    flushReadingProgressImmediately,
    isWorkspaceHydrated,
    ...definedProps({ getReadingPositionSyncState })
  });
  useReadingProgressCaptureHooks({
    activeNodeId,
    editorRef,
    flushReadingProgress,
    isImmersiveMode,
    isViewingTrashNode,
    isWorkspaceHydrated,
    nodeViewById,
    pendingNodeViewByIdRef: latest.pendingNodeViewByIdRef,
    ...definedProps({
      getReadingPositionSelection,
      getReadingPositionSyncState
    })
  });
}
