import { isProtectedRootNode } from '../../features/nodes/model/specialNodes';
import {
  resolveReviewFirstChildNodeId,
  resolveReviewSiblingNodeId,
  resolveReviewSourceTopicNodeId
} from '../../features/review/model/reviewGameNavigation';
import { getDemoRuntimeNowIso } from '../../shared/platform/runtime/demoRuntime';
import { requestFoliolePublishedDelete } from '../../shared/platform/runtime/foliolePublishedManagement';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
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

export function createPaletteReviewActions(args: {
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  requestDeleteSourceTopic: (nodeId: string) => boolean;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const navigationSource = {
    nodeOrder: args.ws.nodeOrder,
    nodesById: args.ws.nodesById,
    trashedNodeIds: args.ws.trashedNodeIds
  };
  const activeNodeId = args.ws.activeNodeId;
  return {
    readReviewTopic: () => args.ws.readReviewTopic(getDemoRuntimeNowIso()),
    postponeReviewTopic: () => args.ws.postponeReviewTopic(getDemoRuntimeNowIso()),
    deleteCurrentReviewItem: createDeleteCurrentReviewItemCommand({ ws: args.ws }),
    deleteReviewSourceTopic: () => {
      const nodeId = activeNodeId ? resolveReviewSourceTopicNodeId(activeNodeId, navigationSource) : null;
      return nodeId ? args.requestDeleteSourceTopic(nodeId) : false;
    },
    dismissReviewTopic: () => args.ws.dismissReviewTopic(getDemoRuntimeNowIso()),
    exitReviewSession: args.ws.exitReviewSession,
    gradeReviewCard: (grade: 1 | 2 | 3 | 4) => args.ws.gradeReviewCard(grade, getDemoRuntimeNowIso()),
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
