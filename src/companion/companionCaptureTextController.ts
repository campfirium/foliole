import {
  getCompanionCaptureTextErrorCode,
  persistCompanionCapturedText
} from './companionCaptureTextActions';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export type CompanionCaptureTextSaveError = 'empty' | 'inbox-unavailable' | 'save-failed';

export type CompanionCaptureTextSaveResult =
  | { error: CompanionCaptureTextSaveError }
  | { nodeId: string; retryRefresh?: () => Promise<unknown> };

export function createCompanionCaptureTextSaveHandler(workspaceSync: CompanionWorkspaceSyncApi) {
  return async (text: string): Promise<CompanionCaptureTextSaveResult> => {
    try {
      const result = await persistCompanionCapturedText({
        deviceId: workspaceSync.bootstrapState.device_id,
        snapshot: workspaceSync.state.workspace_snapshot,
        text
      });
      try {
        await workspaceSync.refreshAfterMutation(result.snapshot);
      } catch {
        return { nodeId: result.nodeId, retryRefresh: () => workspaceSync.refreshAfterMutation(result.snapshot) };
      }
      return { nodeId: result.nodeId };
    } catch (error) {
      return { error: getCompanionCaptureTextErrorCode(error) ?? 'save-failed' };
    }
  };
}
