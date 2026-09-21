import { useCallback } from 'react';

import type { NativeCompanionWorkspaceSyncState } from '../../lib/platform/nativeCompanionSyncContract';
import { loadCompanionVirtualFolderResultIds } from '../shared/platform/companion/runtime/companionVirtualFolderResults';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';

export function useCompanionVirtualFolderLoader(
  state: NativeCompanionWorkspaceSyncState,
  setState: (update: (current: NativeCompanionWorkspaceSyncState) => NativeCompanionWorkspaceSyncState) => void
) {
  return useCallback(async (nodeId: string) => {
    if (!isAvailableNativeCompanionRuntime()) return [];
    const snapshot = state.workspace_snapshot;
    const version = snapshot?.nodesById[nodeId]?.updatedAt;
    if (!snapshot || !version) return [];
    const resultIds = await loadCompanionVirtualFolderResultIds(snapshot, nodeId);
    setState((current) => {
      const currentSnapshot = current.workspace_snapshot;
      if (!currentSnapshot || currentSnapshot.nodesById[nodeId]?.updatedAt !== version) return current;
      return {
        ...current,
        workspace_snapshot: {
          ...currentSnapshot,
          virtualResultIdsByNodeId: {
            ...currentSnapshot.virtualResultIdsByNodeId,
            [nodeId]: resultIds
          }
        }
      };
    });
    return resultIds;
  }, [setState, state]);
}
