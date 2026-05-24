import { useRef, useState } from 'react';

import type { BottomBarGrade } from './CompanionFloatingBars';
import {
  completeCompanionReadingReview,
  deferCompanionReadingReview,
  dismissCompanionReadingReview,
  gradeCompanionReviewCard,
  resolveCompanionReviewSession
} from './companionReviewSession';
import { persistCompanionReviewSyncObject } from './companionReviewSyncPersistence';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import type { useFloatingBarVisibility } from './useFloatingBarVisibility';

type FloatingBarVisibilityApi = ReturnType<typeof useFloatingBarVisibility>;
type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

function useCompanionReviewGradeAction(
  floatingBar: FloatingBarVisibilityApi,
  reviewSession: ReturnType<typeof resolveCompanionReviewSession>,
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'],
  workspaceSync: CompanionWorkspaceSyncApi
) {
  const [isSubmittingGrade, setIsSubmittingGrade] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const isSubmittingGradeRef = useRef(false);

  async function handleGradeReview(grade: BottomBarGrade) {
    if (!snapshot || !reviewSession.currentCard || isSubmittingGradeRef.current) return;
    isSubmittingGradeRef.current = true;
    setIsSubmittingGrade(true);
    setReviewError(null);
    try {
      const result = await gradeCompanionReviewCard({ grade, nodeId: reviewSession.currentCard.nodeId, snapshot });
      if (!result) throw new Error('The current item is no longer available.');
      const persisted = await persistCompanionReviewSyncObject({
        itemKind: 'fsrs',
        nodeId: reviewSession.currentCard.nodeId,
        reviewLog: result.reviewLog,
        snapshot: result.snapshot
      });
      if (!persisted) throw new Error('Failed to persist the review grade.');
      await workspaceSync.replaceSnapshot(result.snapshot, reviewSession.currentCard.nodeId);
      floatingBar.revealBar();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Failed to apply the review grade.');
    } finally {
      isSubmittingGradeRef.current = false;
      setIsSubmittingGrade(false);
    }
  }

  return { handleGradeReview, isSubmittingGrade, reviewError, setReviewError };
}

function useCompanionReadingReviewActions(
  floatingBar: FloatingBarVisibilityApi,
  reviewSession: ReturnType<typeof resolveCompanionReviewSession>,
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'],
  workspaceSync: CompanionWorkspaceSyncApi
) {
  const [isSubmittingReadingAction, setIsSubmittingReadingAction] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);

  async function applyReadingAction(action: 'complete' | 'defer' | 'dismiss') {
    if (!snapshot || !reviewSession.currentCard || reviewSession.currentCard.itemKind !== 'reading' || isSubmittingReadingAction) return;
    setIsSubmittingReadingAction(true);
    setReadingError(null);
    try {
      const result =
        action === 'complete'
          ? completeCompanionReadingReview({ nodeId: reviewSession.currentCard.nodeId, snapshot })
          : action === 'defer'
            ? deferCompanionReadingReview({ nodeId: reviewSession.currentCard.nodeId, snapshot })
            : dismissCompanionReadingReview({ nodeId: reviewSession.currentCard.nodeId, snapshot });
      if (!result) throw new Error('The current reading item is no longer available.');
      await persistCompanionReviewSyncObject({
        itemKind: 'reading',
        nodeId: reviewSession.currentCard.nodeId,
        snapshot: result.snapshot
      });
      await workspaceSync.replaceSnapshot(result.snapshot, reviewSession.currentCard.nodeId);
      floatingBar.revealBar();
    } catch (error) {
      setReadingError(error instanceof Error ? error.message : 'Failed to update the reading item.');
    } finally {
      setIsSubmittingReadingAction(false);
    }
  }

  return {
    handleCompleteReviewItem: () => void applyReadingAction('complete'),
    handleDeferReviewItem: () => void applyReadingAction('defer'),
    handleDismissReviewItem: () => void applyReadingAction('dismiss'),
    isSubmittingReadingAction,
    readingError,
    setReadingError
  };
}

export function useCompanionSurfaceActions(args: {
  floatingBar: FloatingBarVisibilityApi;
  reviewSession: ReturnType<typeof resolveCompanionReviewSession>;
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'];
  workspaceSync: CompanionWorkspaceSyncApi;
}) {
  const gradeAction = useCompanionReviewGradeAction(args.floatingBar, args.reviewSession, args.snapshot, args.workspaceSync);
  const readingActions = useCompanionReadingReviewActions(args.floatingBar, args.reviewSession, args.snapshot, args.workspaceSync);
  return { ...gradeAction, ...readingActions };
}
