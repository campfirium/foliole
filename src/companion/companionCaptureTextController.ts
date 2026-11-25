import type { SelectedImportWarning } from '../shared/platform/import/selectedImportFile';

import {
  getCompanionCaptureTextErrorCode,
  persistCompanionCapturedText
} from './companionCaptureTextActions';
import type { CompanionEpubReadingModeChoice } from './useCompanionEpubReadingMode';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';


type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export type CompanionCaptureTextSaveError = 'empty' | 'inbox-unavailable' | 'target-unavailable' | 'save-failed';

export type CompanionCaptureTextSaveResult =
  | { error: CompanionCaptureTextSaveError }
  | {
    nodeId: string;
    retryRefresh?: () => Promise<unknown>;
    importWarning?: SelectedImportWarning;
    epubReadingModes?: readonly CompanionEpubReadingModeChoice[];
    /** Files of a multi-file import that could not be imported while the others were saved. */
    failedFileCount?: number;
  };

export function createCompanionCaptureTextSaveHandler(workspaceSync: CompanionWorkspaceSyncApi, parentNodeId?: string) {
  return async (text: string): Promise<CompanionCaptureTextSaveResult> => {
    try {
      const result = await persistCompanionCapturedText({
        deviceId: workspaceSync.bootstrapState.device_id,
        snapshot: workspaceSync.state.workspace_snapshot,
        ...(parentNodeId === undefined ? {} : { parentNodeId }),
        text
      });
      // A native write already published the new topic; handing the refresh its preview would reread the library.
      const preview = result.published ? undefined : result.snapshot;
      try {
        await workspaceSync.refreshAfterMutation(preview);
      } catch {
        return { nodeId: result.nodeId, retryRefresh: () => workspaceSync.refreshAfterMutation(preview) };
      }
      return { nodeId: result.nodeId };
    } catch (error) {
      return { error: getCompanionCaptureTextErrorCode(error) ?? 'save-failed' };
    }
  };
}
