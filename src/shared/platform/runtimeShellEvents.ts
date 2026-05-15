import {
  getElectronAPI,
  type ReadwiseReaderImportProgressPayload,
  type WorkspaceContentChangedPayload,
  type WorkspaceSyncAppliedPayload
} from './electronApi';
import { isDesktopRuntime } from './runtime';

export type ManagedInboxUpdateUnlisten = (() => void) | null;
export type ReadwiseReaderImportProgressUnlisten = (() => void) | null;
export type WorkspaceContentChangedUnlisten = (() => void) | null;
export type WorkspaceSyncAppliedUnlisten = (() => void) | null;

function getElectronBridge() {
  if (!isDesktopRuntime()) {
    return null;
  }
  return getElectronAPI();
}

export async function onManagedInboxUpdated(
  handler: (importId: string) => void
): Promise<ManagedInboxUpdateUnlisten> {
  const bridge = getElectronBridge();
  if (!bridge) {
    return null;
  }
  return bridge.onManagedInboxUpdated((importId) => {
    if (!importId.trim()) {
      return;
    }
    handler(importId);
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
    (progress.status === 'running' || progress.status === 'completed' || progress.status === 'failed')
  );
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
