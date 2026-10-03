import { useRef, useState } from 'react';

import { isWorkspacePartialPersistenceError } from '../store/workspacePersistenceFailure';

import type { BottomBarGrade } from './CompanionFloatingBars';
import {
  readCompanionReviewTopic,
  postponeCompanionReviewTopic,
  dismissCompanionReviewTopic
} from './companionReadingReviewSessionActions';
import {
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
      await workspaceSync.refreshAfterMutation(result.snapshot);
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

async function persistReadingAction(
  action: 'read' | 'later' | 'dismiss',
  nodeId: string,
  snapshot: NonNullable<CompanionWorkspaceSyncApi['state']['workspace_snapshot']>
) {
  const result =
    action === 'read'
      ? readCompanionReviewTopic({ nodeId, snapshot })
      : action === 'later'
        ? postponeCompanionReviewTopic({ nodeId, snapshot })
        : dismissCompanionReviewTopic({ nodeId, snapshot });
  if (!result) throw new Error('The current reading topic is no longer available.');
  const persisted = await persistCompanionReviewSyncObject({
    itemKind: 'reading',
    completedReading: action === 'read',
    nodeId,
    nodeIds: result.syncNodeIds,
    snapshot: result.snapshot
  });
  if (!persisted) throw new Error('Failed to persist the reading topic.');
  return result.snapshot;
}

function useCompanionReadingReviewActions(
  floatingBar: FloatingBarVisibilityApi,
  reviewSession: ReturnType<typeof resolveCompanionReviewSession>,
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'],
  workspaceSync: CompanionWorkspaceSyncApi
) {
  const [isSubmittingReadingAction, setIsSubmittingReadingAction] = useState(false);
  const [readingError, setReadingError] = useState<string | null>(null);
  const isSubmittingReadingActionRef = useRef(false);
  const needsReadingRefreshRef = useRef(false);

  async function refreshReadingState() {
    await workspaceSync.refreshAfterMutation();
    needsReadingRefreshRef.current = false;
  }

  async function applyReadingAction(action: 'read' | 'later' | 'dismiss') {
    if (isSubmittingReadingActionRef.current) return;
    if (!needsReadingRefreshRef.current && (!snapshot || reviewSession.currentCard?.itemKind !== 'reading')) return;
    isSubmittingReadingActionRef.current = true;
    setIsSubmittingReadingAction(true);
    setReadingError(null);
    try {
      if (needsReadingRefreshRef.current) {
        await refreshReadingState();
        return;
      }
      if (!snapshot || !reviewSession.currentCard) return;
      const nextSnapshot = await persistReadingAction(action, reviewSession.currentCard.nodeId, snapshot);
      needsReadingRefreshRef.current = true;
      await workspaceSync.refreshAfterMutation(nextSnapshot);
      needsReadingRefreshRef.current = false;
      floatingBar.revealBar();
    } catch (error) {
      setReadingError(error instanceof Error ? error.message : 'Failed to update the reading topic.');
      if (isWorkspacePartialPersistenceError(error)) {
        needsReadingRefreshRef.current = true;
        await refreshReadingState().catch(() => undefined);
      }
    } finally {
      isSubmittingReadingActionRef.current = false;
      setIsSubmittingReadingAction(false);
    }
  }

  return {
    handleReadReviewTopic: () => applyReadingAction('read'),
    handlePostponeReviewTopic: () => applyReadingAction('later'),
    handleDismissReviewTopic: () => applyReadingAction('dismiss'),
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
