import { useCallback } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { loadCompanionVirtualFolderResultIds } from '../shared/platform/companion/runtime/companionVirtualFolderResults';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

export function useCompanionVirtualFolderLoader(
  state: NativeCompanionWorkspaceSyncState
) {
  return useCallback(async (nodeId: string) => {
    if (!isAvailableNativeCompanionRuntime()) return [];
    const snapshot = state.workspace_snapshot;
    const version = snapshot?.nodesById[nodeId]?.updatedAt;
    if (!snapshot || !version) return [];
    const resultIds = await loadCompanionVirtualFolderResultIds(snapshot, nodeId);
    const published = await companionWorkspaceSnapshots.updateDerived(snapshot, current => current ? {
      ...current,
      virtualResultIdsByNodeId: { ...current.virtualResultIdsByNodeId, [nodeId]: resultIds }
    } : current);
    return published ? resultIds : [];
  }, [state]);
}
