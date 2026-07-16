import {
  isFoliolePublishConfigured,
  loadFoliolePublishSettingsFromRuntime,
  publishTopicToFoliole
} from '../../shared/platform/foliolePublishRepository';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { openDiscoursePublishSettings } from './settingsOverlayRequest';

export function createPublishToFolioleCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return async () => {
    const nodeId = args.ws.activeNodeId;
    const node = nodeId ? args.ws.nodesById[nodeId] : null;
    if (!nodeId || !node || node.kind !== 'topic' || node.anchorLink) return false;
    const settings = await loadFoliolePublishSettingsFromRuntime();
    if (!isFoliolePublishConfigured(settings)) {
      showAppRuntimeNotice('Deploy Foliole Publish from Settings first.');
      openDiscoursePublishSettings(args.runtime);
      return false;
    }
    try {
      await args.runtime.flushPendingEditorDraftImmediately();
      const document = await ensureWorkspaceNodeDocumentReady(nodeId, { forceLoad: true });
      await publishTopicToFoliole({
        content: document?.content ?? node.content ?? '',
        node_id: nodeId,
        title: node.title.trim() || 'Untitled'
      });
      showAppRuntimeNotice('Published.');
      return true;
    } catch (error) {
      showAppRuntimeNotice(error instanceof Error ? error.message : 'Foliole Publish failed.');
      return false;
    }
  };
}
