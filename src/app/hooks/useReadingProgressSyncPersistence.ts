import type { MutableRefObject } from 'react';

import { pushDebugTrace } from '../../shared/testing/debugBridge';
import {
  hasWorkspaceRuntimeRepository,
  saveWorkspaceReadingProgressNow
} from '../../shared/platform/workspaceRuntimeRepository';
import { syncReadingProgressToRuntime } from '../../store/workspaceRuntimeSync';
import type { NodeViewState } from '../../store/workspaceStore';

import type { ReadingPositionSyncState } from './useAppRuntime';
import {
  createReadingProgressPayload,
  createReadingProgressSignature,
  updateCapturedNodeViewState,
  type PendingNodeViewStateMap,
  type ReadingProgressCaptureMode,
  type ResolvedReadingProgressState
} from './useReadingProgressSyncSupport';

export interface ReadingProgressPersistenceArgs {
  getReadingPositionSyncState?: () => ReadingPositionSyncState | null;
  isWorkspaceHydrated?: boolean;
  nodeViewById: Record<string, NodeViewState | undefined>;
  pendingNodeViewByIdRef: MutableRefObject<PendingNodeViewStateMap>;
  resolveCapturedReadingProgress: (
    activeNodeIdOverride?: string | null,
    captureNodeIdOverride?: string | null,
    includePendingNodeViewStates?: boolean,
    captureMode?: ReadingProgressCaptureMode
  ) => ResolvedReadingProgressState | null;
  setNodeViewState: (nodeId: string, viewState: NodeViewState) => void;
}

export function flushReadingProgressToRuntime(args: {
  activeNodeIdOverride?: string | null;
  captureMode?: ReadingProgressCaptureMode;
  captureNodeIdOverride?: string | null;
  lastSyncedSignatureRef: MutableRefObject<string | null>;
  persistence: ReadingProgressPersistenceArgs;
}) {
  if (args.persistence.getReadingPositionSyncState?.()) {
    pushDebugTrace('reading-progress.flush-runtime-skipped', {
      activeNodeId: args.activeNodeIdOverride ?? null,
      reason: 'restore-applying'
    });
    return;
  }
  const resolved = args.persistence.resolveCapturedReadingProgress(
    args.activeNodeIdOverride,
    args.captureNodeIdOverride,
    true,
    args.captureMode
  );
  if (!resolved) {
    return;
  }
  updateCapturedNodeViewState({
    captured: resolved.captured,
    nodeViewById: args.persistence.nodeViewById,
    pendingNodeViewByIdRef: args.persistence.pendingNodeViewByIdRef,
    setNodeViewState: args.persistence.setNodeViewState
  });
  pushDebugTrace('reading-progress.flush-runtime', {
    activeNodeId: resolved.resolvedActiveNodeId,
    capturedNodeId: resolved.captured?.nodeId ?? null,
    nodeViewStateCount: Object.keys(resolved.mergedNodeViewById).length,
    reason: args.captureNodeIdOverride === null ? 'node-switch' : 'periodic'
  });
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

export async function flushReadingProgressBeforeClose(args: {
  lastSyncedSignatureRef: MutableRefObject<string | null>;
  persistence: ReadingProgressPersistenceArgs;
}) {
  if (!args.persistence.isWorkspaceHydrated) {
    return false;
  }
  const isRestoreApplying = Boolean(args.persistence.getReadingPositionSyncState?.());
  const resolved = args.persistence.resolveCapturedReadingProgress(
    undefined,
    isRestoreApplying ? null : undefined,
    !isRestoreApplying
  );
  if (!resolved || !hasWorkspaceRuntimeRepository()) {
    return false;
  }
  updateCapturedNodeViewState({
    captured: resolved.captured,
    nodeViewById: args.persistence.nodeViewById,
    pendingNodeViewByIdRef: args.persistence.pendingNodeViewByIdRef,
    setNodeViewState: args.persistence.setNodeViewState
  });
  pushDebugTrace('reading-progress.flush-before-close', {
    activeNodeId: resolved.resolvedActiveNodeId,
    capturedNodeId: resolved.captured?.nodeId ?? null,
    nodeViewStateCount: Object.keys(resolved.mergedNodeViewById).length
  });
  await saveWorkspaceReadingProgressNow(
    createReadingProgressPayload(resolved.resolvedActiveNodeId, resolved.mergedNodeViewById, 'close-flush')
  );
  args.lastSyncedSignatureRef.current = createReadingProgressSignature(
    resolved.resolvedActiveNodeId,
    resolved.mergedNodeViewById
  );
  return true;
}
