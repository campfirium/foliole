import { devReimportSelectedTopic } from '../../shared/platform/devReimportSelectedTopic';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';

export function createReimportSelectedTopicCommand(args: {
  runtime: { isViewingTrashNode: boolean; flushPendingEditorDraftImmediately: () => Promise<boolean> };
  ws: { activeNodeId: string | null };
}) {
  return async () => {
    const nodeId = args.ws.activeNodeId;
    if (!nodeId || args.runtime.isViewingTrashNode) {
      return false;
    }
    if (!await args.runtime.flushPendingEditorDraftImmediately()) return false;
    const result = await devReimportSelectedTopic({ nodeId });
    if (result.status !== 'reimported') {
      showAppRuntimeNotice(result.detail);
      return false;
    }
    await refreshWorkspaceState('reimport-selected-topic');
    await openWorkspaceNodeWithPreparedDocument(result.nodeId ?? nodeId, { forceLoad: true });
    return true;
  };
}

