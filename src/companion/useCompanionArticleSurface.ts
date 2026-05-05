import { useEffect, useMemo, useState } from 'react';

import {
  resolveCompanionRecentArticles,
  resolveReadableCompanionArticleByNodeId
} from '../shared/platform/companionReadableArticle';

import type { BottomBarGrade, TopBarAction } from './CompanionFloatingBars';
import {
  completeCompanionReadingReview,
  deferCompanionReadingReview,
  dismissCompanionReadingReview,
  gradeCompanionReviewCard,
  resolveCompanionReviewSession
} from './companionReviewSession';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import type { useFloatingBarVisibility } from './useFloatingBarVisibility';

type FloatingBarVisibilityApi = ReturnType<typeof useFloatingBarVisibility>;
type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

function useReadableArticleSelection(
  recentArticles: ReturnType<typeof resolveCompanionRecentArticles>,
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'],
  readableArticle: CompanionWorkspaceSyncApi['readableArticle']
) {
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const resolvedReadableArticle = useMemo(
    () =>
      resolveReadableCompanionArticleByNodeId(snapshot, selectedArticleId) ??
      readableArticle,
    [readableArticle, selectedArticleId, snapshot]
  );

  useEffect(() => {
    if (!resolvedReadableArticle) {
      setSelectedArticleId(null);
      return;
    }
    if (!selectedArticleId || !recentArticles.some((article) => article.nodeId === selectedArticleId)) {
      setSelectedArticleId(resolvedReadableArticle.nodeId);
    }
  }, [recentArticles, resolvedReadableArticle, selectedArticleId]);

  return {
    readableArticle: resolvedReadableArticle,
    setSelectedArticleId
  };
}

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
        throw new Error('The current review card is no longer available.');
      }
      await workspaceSync.replaceSnapshot(result.snapshot);
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
      await workspaceSync.replaceSnapshot(result.snapshot);
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
  setActiveAction: (action: TopBarAction) => void;
  setReadingError: (value: string | null) => void;
  setReviewError: (value: string | null) => void;
  setSelectedArticleId: (nodeId: string | null) => void;
}) {
  function handleTopBarAction(action: TopBarAction) {
    args.setActiveAction(action);
    args.setReviewError(null);
    args.setReadingError(null);
    if (action === 'recent') {
      args.floatingBar.revealBar();
    }
  }

  function handleSelectRecentArticle(nodeId: string) {
    args.setSelectedArticleId(nodeId);
    args.setActiveAction('review');
    args.floatingBar.revealBar();
  }

  return { handleSelectRecentArticle, handleTopBarAction };
}

export function useCompanionArticleSurface(workspaceSync: CompanionWorkspaceSyncApi, floatingBar: FloatingBarVisibilityApi) {
  const snapshot = workspaceSync.state.workspace_snapshot;
  const recentArticles = useMemo(() => resolveCompanionRecentArticles(snapshot), [snapshot]);
  const reviewSession = useMemo(() => resolveCompanionReviewSession(snapshot), [snapshot]);
  const [activeAction, setActiveAction] = useState<TopBarAction>('review');
  const { readableArticle, setSelectedArticleId } = useReadableArticleSelection(
    recentArticles,
    snapshot,
    workspaceSync.readableArticle
  );
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
  const { handleSelectRecentArticle, handleTopBarAction } = useCompanionActionState({
    floatingBar,
    setActiveAction,
    setReadingError,
    setReviewError,
    setSelectedArticleId
  });

  useEffect(() => {
    setIsAnswerRevealed(false);
  }, [reviewSession.currentCard?.nodeId]);

  function handleRevealAnswer() {
    setIsAnswerRevealed(true);
  }

  return {
    activeAction,
    handleCompleteReviewItem,
    handleDeferReviewItem,
    handleDismissReviewItem,
    handleSelectRecentArticle,
    handleGradeReview,
    handleRevealAnswer,
    handleTopBarAction,
    isAnswerRevealed,
    isSubmittingGrade,
    isSubmittingReadingAction,
    readableArticle,
    recentArticles,
    readingError,
    reviewError,
    reviewSession
  };
}
