import {
  getElectronAPI,
  type ManagedInboxUpdatedPayload,
  type ReadwiseReaderImportProgressPayload,
  type GlobalCaptureNavigatePayload,
  type WorkspaceContentChangedPayload,
  type WorkspaceSyncAppliedPayload
} from './electronApi';
import { isDesktopRuntime } from './runtime';
import { isNodeMutationPatchResult } from './workspaceRuntimeMutationResults';

export type ManagedInboxUpdateUnlisten = (() => void) | null;
export type GlobalCaptureNavigateUnlisten = (() => void) | null;
export type ReadwiseReaderImportProgressUnlisten = (() => void) | null;
export type { ReadwiseReaderImportProgressPayload };
export type WorkspaceContentChangedUnlisten = (() => void) | null;
export type WorkspaceSyncAppliedUnlisten = (() => void) | null;

function getElectronBridge() {
  if (!isDesktopRuntime()) {
    return null;
  }
  return getElectronAPI();
}

export async function onManagedInboxUpdated(
  handler: (payload: ManagedInboxUpdatedPayload) => void
): Promise<ManagedInboxUpdateUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge) {
    return null;
  }
  return bridge.onManagedInboxUpdated((payload) => {
    const importId = typeof payload === 'string' ? payload : payload?.importId ?? '';
    if (!importId.trim()) {
      return;
    }
    const nodeMutationPatch =
      typeof payload === 'object' && isNodeMutationPatchResult(payload.nodeMutationPatch)
        ? payload.nodeMutationPatch
        : null;
    handler({ importId, nodeMutationPatch });
  });
}

export async function onGlobalCaptureNavigate(
  handler: (payload: GlobalCaptureNavigatePayload) => void
): Promise<GlobalCaptureNavigateUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge?.onGlobalCaptureNavigate) {
    return null;
  }
  return bridge.onGlobalCaptureNavigate((payload) => {
    if (!payload.nodeId.trim()) {
      return;
    }
    handler(payload);
  });
}

function isReadwiseReaderImportProgressPayload(
  payload: unknown
): payload is ReadwiseReaderImportProgressPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const progress = payload as ReadwiseReaderImportProgressPayload;
  return (
    Number.isFinite(progress.processedCount) &&
    Number.isFinite(progress.totalCount) &&
    progress.processedCount >= 0 &&
    progress.totalCount >= 0 &&
    progress.processedCount <= progress.totalCount &&
    hasValidProgressPair(progress.sourceProcessedCount, progress.sourceTotalCount) &&
    hasValidProgressPair(progress.highlightProcessedCount, progress.highlightTotalCount) &&
    hasValidProgressPair(progress.indexProcessedCount, progress.indexTotalCount) &&
    isOptionalNonNegative(progress.indexPendingCount) &&
    isOptionalNonNegative(progress.indexFailedCount) &&
    isOptionalNonNegative(progress.importWriteElapsedMs) &&
    isOptionalNonNegative(progress.indexElapsedMs) &&
    isValidReadwiseProgressPhase(progress.phase) &&
    (progress.status === 'running' || progress.status === 'completed' || progress.status === 'failed')
  );
}

function hasValidProgressPair(processed: number | undefined, total: number | undefined) {
  return processed === undefined ||
    total === undefined ||
    (Number.isFinite(processed) && Number.isFinite(total) && processed >= 0 && total >= 0 && processed <= total);
}

function isOptionalNonNegative(value: number | undefined) {
  return value === undefined || (Number.isFinite(value) && value >= 0);
}

function isValidReadwiseProgressPhase(phase: ReadwiseReaderImportProgressPayload['phase']) {
  return phase === undefined ||
    phase === 'indexing' ||
    phase === 'scanning' ||
    phase === 'writing' ||
    phase === 'source_completed';
}

export async function onReadwiseReaderImportProgress(
  handler: (payload: ReadwiseReaderImportProgressPayload) => void
): Promise<ReadwiseReaderImportProgressUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge?.onReadwiseReaderImportProgress) {
    return null;
  }
  return bridge.onReadwiseReaderImportProgress((payload) => {
    if (!isReadwiseReaderImportProgressPayload(payload)) {
      return;
    }
    handler(payload);
  });
}

export async function onWorkspaceSyncApplied(
  handler: (payload: WorkspaceSyncAppliedPayload) => void
): Promise<WorkspaceSyncAppliedUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge?.onWorkspaceSyncApplied) {
    return null;
  }
  return bridge.onWorkspaceSyncApplied((payload) => {
    if (
      payload.appliedNodeIds.length === 0 &&
      payload.appliedObjectIds.length === 0 &&
      payload.appliedReviewOpIds.length === 0
    ) {
      return;
    }
    handler(payload);
  });
}

export async function onWorkspaceContentChanged(
  handler: (payload: WorkspaceContentChangedPayload) => void
): Promise<WorkspaceContentChangedUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge?.onWorkspaceContentChanged) {
    return null;
  }
  return bridge.onWorkspaceContentChanged((payload) => {
    if (payload.scope !== 'workspace') {
      return;
    }
    handler(payload);
  });
}
