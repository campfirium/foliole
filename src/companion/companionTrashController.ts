import { restoreCompanionTrashNode } from './companionTrashActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function createCompanionTrashRestoreHandler(workspaceSync: CompanionWorkspaceSyncApi) {
  return async (nodeId: string) => {
    const result = await restoreCompanionTrashNode({
      deviceId: workspaceSync.bootstrapState.device_id,
      nodeId,
      snapshot: workspaceSync.state.workspace_snapshot
    });
    if (!result) {
      throw new Error('This topic or folder cannot be restored on this device.');
    }
    await workspaceSync.replaceSnapshot(result.snapshot, result.nodeId);
  };
}
