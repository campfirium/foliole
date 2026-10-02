import {
  getCompanionCaptureTextErrorCode,
  persistCompanionCapturedText
} from './companionCaptureTextActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export type CompanionCaptureTextSaveError = 'empty' | 'inbox-unavailable' | 'save-failed';

export function createCompanionCaptureTextSaveHandler(workspaceSync: CompanionWorkspaceSyncApi) {
  return async (text: string): Promise<{ error: CompanionCaptureTextSaveError } | { nodeId: string }> => {
    try {
      const result = await persistCompanionCapturedText({
        deviceId: workspaceSync.bootstrapState.device_id,
        snapshot: workspaceSync.state.workspace_snapshot,
        text
      });
      await workspaceSync.refreshAfterMutation(result.snapshot);
      return { nodeId: result.nodeId };
    } catch (error) {
      return { error: getCompanionCaptureTextErrorCode(error) ?? 'save-failed' };
    }
  };
}
