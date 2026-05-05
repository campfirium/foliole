import { useCallback, useRef, type MutableRefObject } from 'react';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { getRuntimeInvoke } from '../../shared/platform/runtimeInvoke';
import { pushDebugTrace } from '../../shared/testing/debugBridge';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';
import type { NodeViewState } from '../../store/workspaceStore';

import type { ReadingPositionSyncState } from './useAppRuntime';
import {
  useCloseBridgeRegistration,
  useDebouncedReadingProgressPersistence,
  useImmediateReadingProgressCapture,
  useReadingProgressLifecycle
} from './useReadingProgressSyncEffects';
import {
  captureEditorNodeViewState,
  createReadingProgressPayload,
  createReadingProgressSignature,
  type ResolvedReadingProgressState,
  updateCapturedNodeViewState
} from './useReadingProgressSyncSupport';

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

declare global {
  interface Window {
    __folioleFlushReadingProgressBeforeClose?: () => Promise<boolean>;
  }
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
  const resolveCapturedReadingProgress = useResolvedReadingProgressState({
    activeNodeId,
    editorRef,
    getReadingPositionSelection,
    isViewingTrashNode,
    isWorkspaceHydrated,
    nodeViewById,
    setNodeViewState
  });
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
