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
  browseRootNodeId?: string;
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
  const browseRootNodeIdRef = useRef(args.browseRootNodeId);
  const isWorkspaceHydratedRef = useRef(args.isWorkspaceHydrated);
  const nodeViewByIdRef = useRef(args.nodeViewById);
  const pendingNodeViewByIdRef = useRef<PendingNodeViewStateMap>({});

  activeNodeIdRef.current = args.activeNodeId;
  browseRootNodeIdRef.current = args.browseRootNodeId;
  isWorkspaceHydratedRef.current = args.isWorkspaceHydrated;
  nodeViewByIdRef.current = args.nodeViewById;

  return {
    activeNodeIdRef,
    browseRootNodeIdRef,
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
        activeNodeIdRef: latest.activeNodeIdRef,
        captureMode,
        editorRef: args.editorRef,
        includePendingNodeViewStates,
        isImmersiveMode: args.isImmersiveMode,
        isViewingTrashNode: args.isViewingTrashNode,
        isWorkspaceHydratedRef: latest.isWorkspaceHydratedRef,
        nodeViewByIdRef: latest.nodeViewByIdRef,
        pendingNodeViewByIdRef: latest.pendingNodeViewByIdRef,
        ...definedProps({
          activeNodeIdOverride,
          captureNodeIdOverride,
          getReadingPositionSelection: args.getReadingPositionSelection
        })
      });
    },
    [args, latest]
  );
}

function useReadingProgressFlushCallbacks(args: {
  browseRootNodeIdRef?: MutableRefObject<string | undefined>;
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

function normalizeReadingProgressSyncOptions(args: ReadingProgressSyncOptions) {
  return {
    activeNodeId: args.activeNodeId,
    ...definedProps({ browseRootNodeId: args.browseRootNodeId }),
    editorRef: args.editorRef,
    isImmersiveMode: args.isImmersiveMode,
    isViewingTrashNode: args.isViewingTrashNode,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    nodeViewById: args.nodeViewById,
    setNodeViewState: args.setNodeViewState,
    ...definedProps({
      getReadingPositionSelection: args.getReadingPositionSelection,
      getReadingPositionSyncState: args.getReadingPositionSyncState
    })
  };
}

export function useReadingProgressSync(args: ReadingProgressSyncOptions) {
  const options = normalizeReadingProgressSyncOptions(args);
  const latest = useLatestReadingProgressState(options);
  const resolveCapturedReadingProgress = useResolvedReadingProgressState(options, latest);
  const { flushReadingProgress, flushReadingProgressImmediately } = useReadingProgressFlushCallbacks({
    browseRootNodeIdRef: latest.browseRootNodeIdRef,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    nodeViewById: args.nodeViewById,
    resolveCapturedReadingProgress,
    setNodeViewState: args.setNodeViewState,
    pendingNodeViewByIdRef: latest.pendingNodeViewByIdRef,
    ...definedProps({ getReadingPositionSyncState: args.getReadingPositionSyncState })
  });
  useReadingProgressCloseFlushRegistration(args.isWorkspaceHydrated, flushReadingProgressImmediately);
  useReadingProgressLifecycle({
    activeNodeId: args.activeNodeId,
    flushReadingProgress,
    flushReadingProgressImmediately,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    ...definedProps({ browseRootNodeId: args.browseRootNodeId }),
    ...definedProps({ getReadingPositionSyncState: args.getReadingPositionSyncState })
  });
  useReadingProgressCaptureHooks({
    activeNodeId: args.activeNodeId,
    editorRef: args.editorRef,
    flushReadingProgress,
    isImmersiveMode: args.isImmersiveMode,
    isViewingTrashNode: args.isViewingTrashNode,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    nodeViewById: args.nodeViewById,
    pendingNodeViewByIdRef: latest.pendingNodeViewByIdRef,
    ...definedProps({
      getReadingPositionSelection: args.getReadingPositionSelection,
      getReadingPositionSyncState: args.getReadingPositionSyncState
    })
  });
}
