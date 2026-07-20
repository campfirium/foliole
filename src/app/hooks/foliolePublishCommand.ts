import {
  loadFoliolePublishSettingsFromRuntime
} from '../../shared/platform/foliolePublishRepository';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { requestFoliolePublishDialog } from '../components/foliolePublishDialogRequest';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
export function createPublishToFolioleCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return async () => {
    const nodeId = args.ws.activeNodeId;
    const node = nodeId ? args.ws.nodesById[nodeId] : null;
    if (!nodeId || !node || node.kind !== 'topic' || node.anchorLink) return false;
    const settings = await loadFoliolePublishSettingsFromRuntime();
    if (!settings) return false;
    try {
      await args.runtime.flushPendingEditorDraftImmediately();
      const document = await ensureWorkspaceNodeDocumentReady(nodeId, { forceLoad: true });
      requestFoliolePublishDialog({
        content: document?.content ?? node.content ?? '',
        nodeId,
        settings,
        title: node.title.trim() || 'Untitled'
      });
      return true;
    } catch {
      return false;
    }
  };
}
