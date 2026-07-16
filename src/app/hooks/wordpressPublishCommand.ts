import {
  isWordPressPublishConfigured,
  loadWordPressPublishSettingsFromRuntime
} from '../../shared/platform/wordpressPublishRepository';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { requestWordPressPublishDialog } from '../components/wordpressPublishDialogRequest';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { openDiscoursePublishSettings } from './settingsOverlayRequest';

export function createPublishToWordPressCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return async () => {
    const nodeId = args.ws.activeNodeId;
    const node = nodeId ? args.ws.nodesById[nodeId] : null;
    if (!nodeId || !node || node.kind !== 'topic' || node.anchorLink) return false;
    const settings = await loadWordPressPublishSettingsFromRuntime();
    if (!settings || !isWordPressPublishConfigured(settings)) {
      showAppRuntimeNotice('Connect WordPress publishing first.');
      openDiscoursePublishSettings(args.runtime);
      return false;
    }
    await args.runtime.flushPendingEditorDraftImmediately();
    const document = await ensureWorkspaceNodeDocumentReady(nodeId, { forceLoad: true });
    requestWordPressPublishDialog({
      content: document?.content ?? node.content ?? '',
      nodeId,
      targetSiteUrl: settings.site_url,
      title: node.title.trim() || 'Untitled'
    });
    return true;
  };
}
