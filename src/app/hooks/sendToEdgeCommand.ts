import type { Translate } from '../../shared/localization/LocalizationProvider';
import { sendTopicToEdge } from '../../shared/platform/runtime/edgeReading';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { canSendCurrentTopicToEdge } from './sendToEdgeEligibility';

let isSendingToEdge = false;

export function createSendToEdgeCommand(args: {
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
  externalView: ReturnType<typeof useWorkspaceControllerState>['externalView'];
  virtualView: ReturnType<typeof useWorkspaceControllerState>['virtualView'];
  isStudyMode: boolean;
  demoOperationTranslate: Translate;
}) {
  return async () => {
    const { ws, runtime, demoOperationTranslate: t } = args;
    const nodeId = ws.activeNodeId;
    if (isSendingToEdge || !nodeId || !canSendCurrentTopicToEdge({
      activeNodeId: nodeId,
      isViewingTrashNode: runtime.isViewingTrashNode,
      isExternalViewOpen: args.externalView.isExternalViewOpen,
      isVirtualViewOpen: args.virtualView.isVirtualViewOpen,
      isReviewOnly: args.isStudyMode,
      ws
    })) return false;
    isSendingToEdge = true;
    try {
      if (!await runtime.flushPendingEditorDraftImmediately()) return false;
      const document = await ensureWorkspaceNodeDocumentReady(nodeId, { forceLoad: true });
      if (!document) return false;
      return await sendTopicToEdge({
        title: ws.nodesById[nodeId]?.title || 'Untitled',
        markdown: document.content,
        contentsLabel: t('desktop.command.edgeContents')
      });
    } catch {
      showAppRuntimeNotice(t('desktop.command.sendToEdgeFailed'));
      return false;
    } finally {
      isSendingToEdge = false;
    }
  };
}
