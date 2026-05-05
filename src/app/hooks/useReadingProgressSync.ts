import { useCallback, useRef, type MutableRefObject } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { pushDebugTrace } from '../../shared/testing/debugBridge';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';
import type { NodeViewState } from '../../store/workspaceStore';

import type { ReadingPositionSyncState } from './useAppRuntime';
import { useCloseBridgeRegistration, useDebouncedReadingProgressPersistence, useImmediateReadingProgressCapture, useReadingProgressLifecycle } from './useReadingProgressSyncEffects';
import { captureEditorNodeViewState, createReadingProgressPayload, createReadingProgressSignature, type ResolvedReadingProgressState, updateCapturedNodeViewState } from './useReadingProgressSyncSupport';

export interface ReadingProgressSyncOptions {
  activeNodeId: string | null;
  editorRef: MutableRefObject<EditorAdapter | null>;
  getReadingPositionSelection?: () => { from: number; to: number } | null;
  getReadingPositionSyncState?: () => ReadingPositionSyncState | null;
  isViewingTrashNode: boolean;
  isWorkspaceHydrated: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}

function useLatestReadingProgressState(args: ReadingProgressSyncOptions) {
  const activeNodeIdRef = useRef(args.activeNodeId);
  const isWorkspaceHydratedRef = useRef(args.isWorkspaceHydrated);
  const nodeViewByIdRef = useRef(args.nodeViewById);

  activeNodeIdRef.current = args.activeNodeId;
  isWorkspaceHydratedRef.current = args.isWorkspaceHydrated;
  nodeViewByIdRef.current = args.nodeViewById;

  return {
    activeNodeIdRef,
    isWorkspaceHydratedRef,
    nodeViewByIdRef
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
            args.isViewingTrashNode,
            args.editorRef
          )
        : null;
      return {
        captured,
        mergedNodeViewById: captured
          ? {
              ...latest.nodeViewByIdRef.current,
              [captured.nodeId]: captured.viewState
            }
          : latest.nodeViewByIdRef.current,
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
  resolveCapturedReadingProgress: (
    activeNodeIdOverride?: string | null,
    captureNodeIdOverride?: string | null
  ) => ResolvedReadingProgressState | null;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}) {
  const lastSyncedSignatureRef = useRef<string | null>(null);

  const flushReadingProgress = useCallback(
    (activeNodeIdOverride?: string | null, captureNodeIdOverride?: string | null) =>
      flushReadingProgressToRuntime({
        activeNodeIdOverride,
        args,
        captureNodeIdOverride,
        lastSyncedSignatureRef
      }),
    [args]
  );

  const flushReadingProgressImmediately = useCallback(
    () =>
      flushReadingProgressToCloseBridge({
        args,
        lastSyncedSignatureRef
      }),
    [args]
  );

  return { flushReadingProgress, flushReadingProgressImmediately };
}
function flushReadingProgressToRuntime(args: {
  activeNodeIdOverride?: string | null;
  args: {
    getReadingPositionSyncState?: () => ReadingPositionSyncState | null;
    nodeViewById: Record<string, NodeViewState | undefined>;
    resolveCapturedReadingProgress: (
      activeNodeIdOverride?: string | null,
      captureNodeIdOverride?: string | null
    ) => ResolvedReadingProgressState | null;
    setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
  };
  captureNodeIdOverride?: string | null;
  lastSyncedSignatureRef: MutableRefObject<string | null>;
}) {
  const resolved = args.args.resolveCapturedReadingProgress(
    args.activeNodeIdOverride,
    args.captureNodeIdOverride
  );
  if (!resolved) {
    return;
  }
  updateCapturedNodeViewState({
    captured: resolved.captured,
    nodeViewById: args.args.nodeViewById,
    setNodeViewState: args.args.setNodeViewState
  });
  pushDebugTrace('reading-progress.flush-runtime', {
    activeNodeId: resolved.resolvedActiveNodeId,
    capturedNodeId: resolved.captured?.nodeId ?? null,
    nodeViewStateCount: Object.keys(resolved.mergedNodeViewById).length,
    reason: args.captureNodeIdOverride === null ? 'node-switch' : 'periodic'
  });
  if (args.captureNodeIdOverride === null && args.args.getReadingPositionSyncState?.()) {
    pushDebugTrace('reading-progress.flush-runtime-skipped', {
      activeNodeId: resolved.resolvedActiveNodeId,
      reason: 'node-switch-during-restore'
    });
    return;
  }
  const signature = createReadingProgressSignature(
    resolved.resolvedActiveNodeId,
    resolved.mergedNodeViewById
  );
  if (args.lastSyncedSignatureRef.current === signature) {
    return;
  }
  args.lastSyncedSignatureRef.current = signature;
  syncReadingProgressToRuntime(
    createReadingProgressPayload(resolved.resolvedActiveNodeId, resolved.mergedNodeViewById)
  );
}
async function flushReadingProgressToCloseBridge(args: {
  args: {
    isWorkspaceHydrated: boolean;
    nodeViewById: Record<string, NodeViewState | undefined>;
    resolveCapturedReadingProgress: (
      activeNodeIdOverride?: string | null,
      captureNodeIdOverride?: string | null
    ) => ResolvedReadingProgressState | null;
    setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
  };
  lastSyncedSignatureRef: MutableRefObject<string | null>;
}) {
  if (!args.args.isWorkspaceHydrated) {
    return false;
  }
  const resolved = args.args.resolveCapturedReadingProgress();
  const runtimeInvoke = getRuntimeInvoke();
  if (!resolved || !runtimeInvoke) {
    return false;
  }
  updateCapturedNodeViewState({
    captured: resolved.captured,
    nodeViewById: args.args.nodeViewById,
    setNodeViewState: args.args.setNodeViewState
  });
  pushDebugTrace('reading-progress.flush-close-bridge', {
    activeNodeId: resolved.resolvedActiveNodeId,
    capturedNodeId: resolved.captured?.nodeId ?? null,
    nodeViewStateCount: Object.keys(resolved.mergedNodeViewById).length
  });
  await runtimeInvoke(
    NATIVE_COMMANDS.saveReadingProgress,
    createReadingProgressPayload(resolved.resolvedActiveNodeId, resolved.mergedNodeViewById)
  );
  args.lastSyncedSignatureRef.current = createReadingProgressSignature(
    resolved.resolvedActiveNodeId,
    resolved.mergedNodeViewById
  );
  return true;
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
  const options = createReadingProgressOptions({
    activeNodeId,
    editorRef,
    getReadingPositionSelection,
    getReadingPositionSyncState,
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
    setNodeViewState
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
    isViewingTrashNode,
    isWorkspaceHydrated,
    nodeViewById,
    setNodeViewState
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
