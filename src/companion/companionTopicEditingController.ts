import { persistCompanionTopicContent } from './companionTopicEditingActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function createCompanionTopicContentSaveHandler(workspaceSync: CompanionWorkspaceSyncApi) {
  return async (nodeId: string, content: string) => {
    const result = await persistCompanionTopicContent({
      content,
      deviceId: workspaceSync.bootstrapState.device_id,
      nodeId,
      snapshot: workspaceSync.state.workspace_snapshot
    });
    if (!result) {
      throw new Error('This topic cannot be edited on this device.');
    }
    await workspaceSync.replaceSnapshot(result.snapshot, result.nodeId);
  };
}
