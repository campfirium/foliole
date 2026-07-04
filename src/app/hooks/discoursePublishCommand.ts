import { isDiscoursePublishConfigured, loadDiscoursePublishSettingsFromRuntime } from '../../shared/platform/discoursePublishRepository';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { requestDiscoursePublishDialog } from '../components/discoursePublishDialogRequest';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { openDiscoursePublishSettings } from './settingsOverlayRequest';

export function createPublishToDiscourseCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return async () => {
    const nodeId = args.ws.activeNodeId;
    const node = nodeId ? args.ws.nodesById[nodeId] : null;
    if (!nodeId || !node || node.kind !== 'topic' || node.anchorLink) return false;
    const settings = await loadDiscoursePublishSettingsFromRuntime();
    if (!isDiscoursePublishConfigured(settings)) {
      showAppRuntimeNotice('Configure Discourse publishing first.');
      openDiscoursePublishSettings(args.runtime);
      return false;
    }
    await args.runtime.flushPendingEditorDraftImmediately();
    const document = await ensureWorkspaceNodeDocumentReady(nodeId, { forceLoad: true });
    requestDiscoursePublishDialog({
      content: document?.content ?? node.content ?? '',
      nodeId,
      title: node.title.trim() || 'Untitled'
    });
    return true;
  };
}
