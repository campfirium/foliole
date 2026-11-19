import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { requestSplitTopicDialog } from '../components/SplitTopicDialogRequest';
import { recordSplitTopicTrace, type SplitTopicTrace } from '../splitTopicTrace';

import type { useWorkspaceSelectors, useWorkspaceControllerState } from './appControllerState';

export function createSplitTopicCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return async (trace?: SplitTopicTrace) => {
    const nodeId = args.ws.activeNodeId;
    if (!nodeId || args.runtime.isViewingTrashNode || args.ws.nodesById[nodeId]?.kind !== 'topic') {
      recordSplitTopicTrace(trace, { event: 'split.topic.stage', stage: 'source-ineligible' });
      return false;
    }
    const flushed = await args.runtime.flushPendingEditorDraftImmediately();
    if (!flushed) {
      recordSplitTopicTrace(trace, { event: 'split.topic.stage', stage: 'draft-save-failed' });
      showAppRuntimeNotice('Could not save the latest topic draft.');
      return false;
    }
    recordSplitTopicTrace(trace, { event: 'split.topic.stage', stage: 'dialog-requested' });
    requestSplitTopicDialog(nodeId, trace);
    return true;
  };
}
