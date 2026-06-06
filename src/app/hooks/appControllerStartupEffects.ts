import { isReviewSessionCompleted } from '../../store/workspaceReviewReading';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { useGuidedSampleAutoOpen } from './useGuidedSampleAutoOpen';
import { useReviewModeStartupSessionRestore } from './useReviewModeStartupSessionRestore';
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
  isWorkspaceHydrated: boolean;
  startStudyMode: ReturnType<typeof useWorkspaceControllerState>['study']['startStudyMode'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  useReviewQueueDocumentPrefetch(args.ws.reviewSession);
  useReviewModeStartupSessionRestore({
    activeNodeId: args.ws.activeNodeId,
    isReviewSessionCompleted: isReviewSessionCompleted(args.ws.reviewSession),
    isStudyMode: args.isStudyMode,
    isWorkspaceHydrated: args.isWorkspaceHydrated,
    onReviewSessionStarted: () => openNotesViewForRestoredReviewMode(args.controller),
    resumeReviewSession: args.ws.resumeReviewSession,
    reviewCurrentNodeId: args.ws.reviewSession.currentNodeId,
    startReviewSession: args.ws.startReviewSession
  });
  useGuidedSampleAutoOpen(args.isWorkspaceHydrated, {
    openNotesView: args.controller.trash.closeTrashView,
    startStudyMode: args.startStudyMode
  });
}
