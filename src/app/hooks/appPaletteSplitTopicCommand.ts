import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { requestSplitTopicDialog } from '../components/SplitTopicDialogRequest';

import type { useWorkspaceSelectors, useWorkspaceControllerState } from './appControllerState';

export function createSplitTopicCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return async () => {
    const nodeId = args.ws.activeNodeId;
    if (!nodeId || args.runtime.isViewingTrashNode || args.ws.nodesById[nodeId]?.kind !== 'topic') {
      return false;
    }
    const flushed = await args.runtime.flushPendingEditorDraftImmediately();
    if (!flushed) {
      showAppRuntimeNotice('Could not save the latest topic draft.');
      return false;
    }
    requestSplitTopicDialog(nodeId);
    return true;
  };
}
