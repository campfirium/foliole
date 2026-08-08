import { isReviewSessionCompleted } from '../../store/workspaceReviewReading';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import {
  useReviewModeRestoredSessionAutoOpen,
  useReviewModeStartupSessionRestore
} from './useReviewModeStartupSessionRestore';
import { useReviewQueueDocumentPrefetch } from './useReviewQueueDocumentPrefetch';

function openNotesViewForRestoredReviewMode(controller: ReturnType<typeof useWorkspaceControllerState>) {
  controller.runtime.flushPendingEditorDraft();
  controller.runtime.setIsViewingTrashNode(false);
  controller.trash.closeTrashView();
  controller.externalView.closeExternalView();
  controller.virtualView.closeVirtualView();
}

export function useControllerStartupEffects(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  isStudyMode: boolean;
  isReviewSchedulerSettingsReady: boolean;
  isWorkspaceHydrated: boolean;
  startStudyMode: ReturnType<typeof useWorkspaceControllerState>['study']['startStudyMode'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const isRestoredReviewSessionCompleted = isReviewSessionCompleted(args.ws.reviewSession);
  useReviewQueueDocumentPrefetch(args.ws.reviewSession);
  useReviewModeRestoredSessionAutoOpen({
    isReviewSessionCompleted: isRestoredReviewSessionCompleted,
    isReviewSchedulerSettingsReady: args.isReviewSchedulerSettingsReady,
    isStudyMode: args.isStudyMode,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    reviewCurrentNodeId: args.ws.reviewSession.currentNodeId,
    startStudyMode: args.startStudyMode
  });
  useReviewModeStartupSessionRestore({
    activeNodeId: args.ws.activeNodeId,
    isReviewSessionCompleted: isRestoredReviewSessionCompleted,
    isReviewSchedulerSettingsReady: args.isReviewSchedulerSettingsReady,
    isStudyMode: args.isStudyMode,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    onReviewSessionStarted: () => openNotesViewForRestoredReviewMode(args.controller),
    resumeReviewSession: args.ws.resumeReviewSession,
    reviewCurrentNodeId: args.ws.reviewSession.currentNodeId,
    startReviewSession: args.ws.startReviewSession
  });
}
