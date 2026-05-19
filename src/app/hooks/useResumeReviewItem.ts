import { useCallback } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettingsContextValue } from '../../features/settings/context/reviewSchedulerSettingsContext';
import { buildCachedReviewQueuePlan } from '../../store/reviewQueuePlannerCached';
import type { ReviewSessionState } from '../../store/workspaceStore';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';

export function resolveResumeReviewNodeId(args: {
  nodesById: Record<string, Node>;
  queueNodeIds: string[];
  reviewSession: ReviewSessionState;
  trashedNodeIds: string[];
}) {
  const isLiveNode = (nodeId: string) => Boolean(args.nodesById[nodeId]) && !args.trashedNodeIds.includes(nodeId);
  const queueNodeId = args.queueNodeIds.find(isLiveNode);
  if (queueNodeId) {
    return queueNodeId;
  }
  const currentNodeId = args.reviewSession.currentNodeId;
  if (currentNodeId && args.reviewSession.queueNodeIds.includes(currentNodeId) && isLiveNode(currentNodeId)) {
    return currentNodeId;
  }
  return args.reviewSession.queueNodeIds.find(isLiveNode) ?? (currentNodeId && isLiveNode(currentNodeId) ? currentNodeId : null);
}

export function useResumeReviewItem(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  nowIso: string;
  reviewSettings: ReviewSchedulerSettingsContextValue;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return useCallback(() => {
    const queueNodeIds = buildCachedReviewQueuePlan({
      includeScheduled: true,
      nodeOrder: args.ws.nodeOrder,
      nodesById: args.ws.nodesById,
      now: args.nowIso,
      pushQueueRules: args.reviewSettings.reviewSchedulerSettings.pushQueue,
      trashedNodeIds: args.ws.trashedNodeIds
    }).queueNodeIds;
    const nodeId = resolveResumeReviewNodeId({
      nodesById: args.ws.nodesById,
      queueNodeIds,
      reviewSession: args.ws.reviewSession,
      trashedNodeIds: args.ws.trashedNodeIds
    });
    if (!nodeId) {
      return;
    }
    args.ws.resumeReviewSession(args.nowIso);
    args.controller.runtime.flushPendingEditorDraft();
    args.controller.runtime.setIsViewingTrashNode(false);
    args.controller.trash.closeTrashView();
    args.controller.externalView.closeExternalView();
    args.controller.virtualView.closeVirtualView();
    args.controller.nav.handleSelectNode(nodeId);
  }, [args.controller, args.nowIso, args.reviewSettings.reviewSchedulerSettings.pushQueue, args.ws.nodeOrder, args.ws.nodesById, args.ws.reviewSession, args.ws.trashedNodeIds]);
}
