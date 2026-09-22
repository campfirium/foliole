import { isProtectedRootNode } from '../../features/nodes/model/specialNodes';
import {
  resolveReviewFirstChildNodeId,
  resolveReviewSiblingNodeId,
  resolveReviewSourceTopicNodeId
} from '../../features/review/model/reviewGameNavigation';
import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import { getDemoRuntimeNowIso } from '../../shared/platform/runtime/demoRuntime';
import { requestFoliolePublishedDelete } from '../../shared/platform/runtime/foliolePublishedManagement';
import { findEnabledSequentialReadingSourceId } from '../../store/workspaceSequentialReading';
import { isReadActionAdvanceReadyFromMetrics } from '../components/readActionAdvanceState';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { submitReadingReviewFeedback } from './readingReviewFeedbackState';
import { submitReviewGradeFeedback } from './reviewGradeFeedbackState';
import { scrollReviewReadingSurface } from './reviewReadingScrollCommand';

export function resolveReviewDeleteTargetNodeId(ws: ReturnType<typeof useWorkspaceSelectors>) {
  const nodeId = ws.activeNodeId;
  const node = nodeId ? ws.nodesById[nodeId] : null;
  if (!nodeId || !node || isProtectedRootNode(node)) {
    return null;
  }
  return nodeId;
}

function createDeleteCurrentReviewItemCommand(args: {
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return () => {
    const nodeId = resolveReviewDeleteTargetNodeId(args.ws);
    if (!nodeId) {
      return false;
    }
    requestFoliolePublishedDelete({ nodeIds: [nodeId], onAllowed: () => args.ws.deleteNode(nodeId) });
    return true;
  };
}

function createSelectReviewNodeCommand(args: {
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  nodeId: string | null;
}) {
  return () => {
    if (!args.nodeId) {
      return false;
    }
    args.nav.handleSelectNode(args.nodeId, null, 'target-context');
    return true;
  };
}

type PaletteReviewArgs = {
  isStudyMode: boolean;
  externalView: ReturnType<typeof useWorkspaceControllerState>['externalView'];
  virtualView: ReturnType<typeof useWorkspaceControllerState>['virtualView'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  requestDeleteSourceTopic: (nodeId: string) => boolean;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
};

function readReviewTopic(args: PaletteReviewArgs) {
  const nodeId = args.ws.reviewSession.currentNodeId;
  const editor = args.runtime.editorRef.current;
  const releaseSequentialReading = Boolean(
    args.isStudyMode && !args.trash.isTrashViewOpen && nodeId && args.ws.activeNodeId === nodeId &&
    !args.externalView.isExternalViewOpen && !args.virtualView.isVirtualViewOpen && !args.runtime.isViewingTrashNode &&
    getReviewItemKind(args.ws.nodesById[nodeId]) !== 'fsrs' &&
    findEnabledSequentialReadingSourceId(nodeId, args.ws.nodesById) && editor &&
    isReadActionAdvanceReadyFromMetrics(editor.getScrollMetrics())
  );
  return submitReadingReviewFeedback(nodeId, () => args.ws.readReviewTopic(getDemoRuntimeNowIso(), { releaseSequentialReading }));
}

export function createPaletteReviewActions(args: PaletteReviewArgs) {
  const navigationSource = {
    nodeOrder: args.ws.nodeOrder,
    nodesById: args.ws.nodesById,
    trashedNodeIds: args.ws.trashedNodeIds
  };
  const activeNodeId = args.ws.activeNodeId;
  return {
    readReviewTopic: () => readReviewTopic(args),
    postponeReviewTopic: () => submitReadingReviewFeedback(
      args.ws.reviewSession.currentNodeId, () => args.ws.postponeReviewTopic(getDemoRuntimeNowIso())
    ),
    deleteCurrentReviewItem: createDeleteCurrentReviewItemCommand({ ws: args.ws }),
    deleteReviewSourceTopic: () => {
      const nodeId = activeNodeId ? resolveReviewSourceTopicNodeId(activeNodeId, navigationSource) : null;
      return nodeId ? args.requestDeleteSourceTopic(nodeId) : false;
    },
    dismissReviewTopic: () => submitReadingReviewFeedback(
      args.ws.reviewSession.currentNodeId, () => args.ws.dismissReviewTopic(getDemoRuntimeNowIso())
    ),
    exitReviewSession: args.ws.exitReviewSession,
    gradeReviewCard: (grade: 1 | 2 | 3 | 4) =>
      submitReviewGradeFeedback(args.ws.reviewSession.currentNodeId, () => args.ws.gradeReviewCard(grade, getDemoRuntimeNowIso())),
    reviewNavigateDown: createSelectReviewNodeCommand({
      nav: args.nav,
      nodeId: activeNodeId ? resolveReviewFirstChildNodeId(activeNodeId, navigationSource) : null
    }),
    reviewNavigateNextSibling: createSelectReviewNodeCommand({
      nav: args.nav,
      nodeId: activeNodeId ? resolveReviewSiblingNodeId(activeNodeId, 1, navigationSource) : null
    }),
    reviewNavigateParent: () => {
      if (!activeNodeId || !args.ws.nodesById[activeNodeId]?.parentNodeId) {
        return false;
      }
      args.nav.handleGoParent();
      return true;
    },
    reviewNavigatePreviousSibling: createSelectReviewNodeCommand({
      nav: args.nav,
      nodeId: activeNodeId ? resolveReviewSiblingNodeId(activeNodeId, -1, navigationSource) : null
    }),
    reviewScrollReadingDown: () => scrollReviewReadingSurface(args.runtime.editorRef.current, 'down'),
    reviewScrollReadingUp: () => scrollReviewReadingSurface(args.runtime.editorRef.current, 'up'),
    revealReviewAnswer: args.ws.revealReviewAnswer,
    revisitReviewTopicSoon: () => args.ws.revisitReviewTopicSoon(getDemoRuntimeNowIso()),
    startReviewSession: () => args.ws.startReviewSession(getDemoRuntimeNowIso())
  };
}
