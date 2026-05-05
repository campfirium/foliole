import { useEffect, useMemo, useState } from 'react';

import type { BottomBarGrade, CompanionTabAction } from './CompanionFloatingBars';
import {
  completeCompanionReadingReview,
  deferCompanionReadingReview,
  dismissCompanionReadingReview,
  gradeCompanionReviewCard,
  resolveCompanionReviewSession
} from './companionReviewSession';
import { persistCompanionReviewSyncObject } from './companionReviewSyncPersistence';
import { useCompanionBrowseState } from './useCompanionBrowseState';
import { useCompanionMissingBodySync } from './useCompanionMissingBodySync';
import { useCompanionViewStateSync } from './useCompanionViewStateSync';
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

  async function handleGradeReview(grade: BottomBarGrade) {
    if (!snapshot || !reviewSession.currentCard || isSubmittingGrade) {
      return;
    }

    setIsSubmittingGrade(true);
    setReviewError(null);
    try {
      const result = await gradeCompanionReviewCard({
        grade,
        nodeId: reviewSession.currentCard.nodeId,
        snapshot
      });
      if (!result) {
        throw new Error('The current review item is no longer available.');
      }
      await persistCompanionReviewSyncObject({
        itemKind: 'fsrs',
        nodeId: reviewSession.currentCard.nodeId,
        reviewLog: result.reviewLog,
        snapshot: result.snapshot
      });
      await workspaceSync.replaceSnapshot(result.snapshot, reviewSession.currentCard.nodeId);
      floatingBar.revealBar();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : 'Failed to apply the review grade.');
    } finally {
      setIsSubmittingGrade(false);
    }
  }

  return {
    handleGradeReview,
    isSubmittingGrade,
    reviewError,
    setReviewError
  };
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
    if (!snapshot || !reviewSession.currentCard || reviewSession.currentCard.itemKind !== 'reading' || isSubmittingReadingAction) {
      return;
    }

    setIsSubmittingReadingAction(true);
    setReadingError(null);
    try {
      const result =
        action === 'complete'
          ? completeCompanionReadingReview({ nodeId: reviewSession.currentCard.nodeId, snapshot })
          : action === 'defer'
            ? deferCompanionReadingReview({ nodeId: reviewSession.currentCard.nodeId, snapshot })
            : dismissCompanionReadingReview({ nodeId: reviewSession.currentCard.nodeId, snapshot });
      if (!result) {
        throw new Error('The current reading item is no longer available.');
      }
      await persistCompanionReviewSyncObject({
        itemKind: 'reading',
        nodeId: reviewSession.currentCard.nodeId,
        snapshot: result.snapshot
      });
      await workspaceSync.replaceSnapshot(result.snapshot, reviewSession.currentCard.nodeId);
      floatingBar.revealBar();
    } catch (error) {
      setReadingError(error instanceof Error ? error.message : 'Failed to update the reading review item.');
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

function useCompanionSurfaceActions(args: {
  floatingBar: FloatingBarVisibilityApi;
  reviewSession: ReturnType<typeof resolveCompanionReviewSession>;
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'];
  workspaceSync: CompanionWorkspaceSyncApi;
}) {
  const gradeAction = useCompanionReviewGradeAction(
    args.floatingBar,
    args.reviewSession,
    args.snapshot,
    args.workspaceSync
  );
  const readingActions = useCompanionReadingReviewActions(
    args.floatingBar,
    args.reviewSession,
    args.snapshot,
    args.workspaceSync
  );

  return {
    ...gradeAction,
    ...readingActions
  };
}

function useCompanionActionState(args: {
  floatingBar: FloatingBarVisibilityApi;
  setActiveAction: (action: CompanionTabAction) => void;
  setReadingError: (value: string | null) => void;
  setReviewError: (value: string | null) => void;
  setSelectedBrowseNodeId: (nodeId: string | null) => void;
}) {
  function handleTabAction(action: CompanionTabAction) {
    args.setActiveAction(action);
    args.setReviewError(null);
    args.setReadingError(null);
    if (action === 'recent') {
      args.setSelectedBrowseNodeId(null);
      args.floatingBar.revealBar();
    }
  }

  function handleSelectRecentArticle(nodeId: string) {
    args.setSelectedBrowseNodeId(nodeId);
    args.setActiveAction('recent');
    args.floatingBar.revealBar();
  }

  function handleSelectBrowseNode(nodeId: string) {
    args.setSelectedBrowseNodeId(nodeId);
    args.setActiveAction('recent');
    args.floatingBar.revealBar();
  }

  return { handleSelectBrowseNode, handleSelectRecentArticle, handleTabAction };
}

function useCompanionInteractionState(
  floatingBar: FloatingBarVisibilityApi,
  reviewSession: ReturnType<typeof resolveCompanionReviewSession>,
  setActiveAction: (action: CompanionTabAction) => void,
  setSelectedBrowseNodeId: (nodeId: string | null) => void,
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'],
  workspaceSync: CompanionWorkspaceSyncApi
) {
  const {
    handleGradeReview,
    handleCompleteReviewItem,
    handleDeferReviewItem,
    handleDismissReviewItem,
    isSubmittingGrade,
    isSubmittingReadingAction,
    readingError,
    reviewError,
    setReadingError,
    setReviewError
  } = useCompanionSurfaceActions({
    floatingBar,
    reviewSession,
    snapshot,
    workspaceSync
  });
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const { handleSelectBrowseNode, handleSelectRecentArticle, handleTabAction } = useCompanionActionState({
    floatingBar,
    setActiveAction,
    setReadingError,
    setReviewError,
    setSelectedBrowseNodeId
  });

  useEffect(() => {
    setIsAnswerRevealed(false);
  }, [reviewSession.currentCard?.nodeId]);

  function handleRevealAnswer() {
    setIsAnswerRevealed(true);
  }

  return {
    handleCompleteReviewItem,
    handleDeferReviewItem,
    handleDismissReviewItem,
    handleGradeReview,
    handleRevealAnswer,
    handleSelectBrowseNode,
    handleSelectRecentArticle,
    handleTabAction,
    isAnswerRevealed,
    isSubmittingGrade,
    isSubmittingReadingAction,
    readingError,
    reviewError
  };
}

function useReadableArticleWithBodySyncStatus(
  readableArticle: CompanionWorkspaceSyncApi['readableArticle'],
  fetchingBodyKey: string | null
) {
  return useMemo(() => {
    if (!readableArticle?.bodyBlobHash || !fetchingBodyKey) {
      return readableArticle;
    }
    const articleKey = `${readableArticle.nodeId}:${readableArticle.bodyBlobHash}:${readableArticle.bodyStatus}`;
    if (articleKey !== fetchingBodyKey) {
      return readableArticle;
    }
    return { ...readableArticle, bodyStatus: 'fetching' as const };
  }, [fetchingBodyKey, readableArticle]);
}

export function useCompanionArticleSurface(workspaceSync: CompanionWorkspaceSyncApi, floatingBar: FloatingBarVisibilityApi) {
  const [activeAction, setActiveAction] = useState<CompanionTabAction>(() => {
    return workspaceSync.state.workspace_snapshot ? 'review' : 'more';
  });
  const browseState = useCompanionBrowseState(workspaceSync);
  const handleViewScroll = useCompanionViewStateSync({
    activeAction,
    readableArticleNodeId: browseState.readableArticle?.nodeId ?? null,
    reviewNodeId: browseState.reviewSession.currentCard?.nodeId ?? null,
    selectedBrowseNodeId: browseState.selectedBrowseNodeId
  });
  const interactionState = useCompanionInteractionState(
    floatingBar,
    browseState.reviewSession,
    setActiveAction,
    browseState.setSelectedBrowseNodeId,
    browseState.snapshot,
    workspaceSync
  );

  useEffect(() => {
    if (!workspaceSync.state.workspace_snapshot) {
      setActiveAction('more');
    }
  }, [workspaceSync.state.workspace_snapshot]);

  const missingBodySync = useCompanionMissingBodySync({ readableArticle: browseState.readableArticle, workspaceSync });
  const readableArticle = useReadableArticleWithBodySyncStatus(
    browseState.readableArticle,
    missingBodySync.fetchingBodyKey
  );

  return {
    activeAction,
    browsedFolder: browseState.browsedFolder,
    readableArticle,
    recentArticles: browseState.recentArticles,
    reviewSession: browseState.reviewSession,
    selectedBrowseNodeId: browseState.selectedBrowseNodeId,
    handleViewScroll,
    ...interactionState
  };
}
