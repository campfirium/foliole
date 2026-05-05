import { getElectronAPI, type WorkspaceSyncAppliedPayload } from './electronApi';
import { isDesktopRuntime } from './runtime';

export type ManagedInboxUpdateUnlisten = (() => void) | null;
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
