import { prepareArticleHandoff } from '../../../lib/core/articleHandoff/prepareArticleHandoff';
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
      ws
    })) return false;
    isSendingToEdge = true;
    try {
      const article = await prepareArticleHandoff(
        () => runtime.flushPendingEditorDraftImmediately(),
        async () => {
          const document = await ensureWorkspaceNodeDocumentReady(nodeId, { forceLoad: true });
          return document && { content: document.content, title: ws.nodesById[nodeId]?.title || 'Untitled' };
        }
      );
      if (!article) return false;
      return await sendTopicToEdge({
        ...article,
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
