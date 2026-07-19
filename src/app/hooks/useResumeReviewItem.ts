import { useCallback } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import type { ReviewSchedulerSettingsContextValue } from '../../features/settings/context/reviewSchedulerSettingsContext';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { buildResumeReviewSessionQueue } from '../../store/workspaceReviewResumeQueue';
import type { ReviewSessionState } from '../../store/workspaceStore';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';

export const RESUME_REVIEW_UNAVAILABLE_NOTICE = 'Nothing is available to resume in Flow.';

export function resolveResumeReviewNodeId(args: {
  nodesById: Record<string, Node>;
  queueNodeIds: string[];
  reviewSession: ReviewSessionState;
  trashedNodeIds: string[];
}) {
  const isLiveNode = (nodeId: string) => Boolean(args.nodesById[nodeId]) && !args.trashedNodeIds.includes(nodeId);
  const currentNodeId = args.reviewSession.currentNodeId;
  if (currentNodeId && args.queueNodeIds.includes(currentNodeId) && isLiveNode(currentNodeId)) {
    return currentNodeId;
  }
  return args.queueNodeIds.find(isLiveNode) ?? null;
}

export function useResumeReviewItem(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  nowIso: string;
  reviewSettings: ReviewSchedulerSettingsContextValue;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const demoRuntime = useDemoRuntimeState();
  return useCallback(() => {
    if (!args.reviewSettings.isReviewSchedulerSettingsReady) {
      showAppRuntimeNotice(RESUME_REVIEW_UNAVAILABLE_NOTICE);
      return;
    }
    const resumeOptions = {
      includeScheduledFallback: demoRuntime.isDemo,
      preferredNodeId: args.ws.activeNodeId
    };
    const queueNodeIds = buildResumeReviewSessionQueue(args.ws, args.nowIso, resumeOptions);
    const nodeId = resolveResumeReviewNodeId({
      nodesById: args.ws.nodesById,
      queueNodeIds,
      reviewSession: args.ws.reviewSession,
      trashedNodeIds: args.ws.trashedNodeIds
    });
    if (!nodeId) {
      showAppRuntimeNotice(RESUME_REVIEW_UNAVAILABLE_NOTICE);
      return;
    }
    if (!args.ws.resumeReviewSession(args.nowIso, resumeOptions)) {
      showAppRuntimeNotice(RESUME_REVIEW_UNAVAILABLE_NOTICE);
      return;
    }
    args.controller.runtime.flushPendingEditorDraft();
    args.controller.runtime.setIsViewingTrashNode(false);
    args.controller.trash.closeTrashView();
    args.controller.externalView.closeExternalView();
    args.controller.virtualView.closeVirtualView();
    args.controller.nav.handleSelectNode(nodeId, null, 'target-context');
  }, [args.controller, args.nowIso, args.reviewSettings.isReviewSchedulerSettingsReady, args.reviewSettings.reviewSchedulerSettings.pushQueue, args.ws.activeNodeId, args.ws.nodeOrder, args.ws.nodesById, args.ws.reviewSession, args.ws.reviewSessionMode, args.ws.trashedNodeIds, demoRuntime.isDemo]);
}
