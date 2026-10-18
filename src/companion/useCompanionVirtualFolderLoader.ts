import { useCallback } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { companionWorkspaceSnapshots } from '../shared/platform/companion/companionWorkspaceSnapshotStore';
import { getCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { loadCompanionVirtualFolderResultIds } from '../shared/platform/companion/runtime/companionVirtualFolderResults';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

export function useCompanionVirtualFolderLoader(
  state: NativeCompanionWorkspaceSyncState
) {
  return useCallback(async (nodeId: string) => {
    if (!isAvailableNativeCompanionRuntime()) return [];
    const scope = getCompanionReadingScope();
    let snapshot = state.workspace_snapshot;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!snapshot?.nodesById[nodeId]?.updatedAt) return [];
      const resultIds = await loadCompanionVirtualFolderResultIds(snapshot, nodeId);
      if (scope !== getCompanionReadingScope()) return [];
      const published = await companionWorkspaceSnapshots.updateDerived(snapshot, current => current ? {
        ...current,
        virtualResultIdsByNodeId: { ...current.virtualResultIdsByNodeId, [nodeId]: resultIds }
      } : current);
      if (published) return resultIds;
      if (scope !== getCompanionReadingScope()) return [];
      snapshot = companionWorkspaceSnapshots.getSnapshot();
    }
    return [];
  }, [state]);
}
