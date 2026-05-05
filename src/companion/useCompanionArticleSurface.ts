import { useEffect, useMemo, useState } from 'react';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { resolveCompanionReviewSession } from './companionReviewSession';
import { useCompanionActionState } from './useCompanionActionState';
import type { CompanionBrowseSortState } from './useCompanionBrowseState';
import { useCompanionBrowseState } from './useCompanionBrowseState';
import { useCompanionMissingBodySync } from './useCompanionMissingBodySync';
import { useCompanionSurfaceActions } from './useCompanionSurfaceActions';
import { useCompanionViewStateSync } from './useCompanionViewStateSync';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import type { useFloatingBarVisibility } from './useFloatingBarVisibility';

type FloatingBarVisibilityApi = ReturnType<typeof useFloatingBarVisibility>;
type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

function useCompanionBrowseReturnState() {
  const [browseReturnNodeId, setBrowseReturnNodeId] = useState<string | null>(null);
  return { browseReturnNodeId, setBrowseReturnNodeId };
}

function useCompanionBrowseActions(args: {
  browsedFolderNodeId: string | null;
  floatingBar: FloatingBarVisibilityApi;
  setActiveAction: (action: CompanionTabAction) => void;
  setReadingError: (value: string | null) => void;
  setReviewError: (value: string | null) => void;
  setSelectedBrowseNodeId: (nodeId: string | null) => void;
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'];
  workspaceSync: CompanionWorkspaceSyncApi;
}) {
  const browseReturn = useCompanionBrowseReturnState();
  return useCompanionActionState({
    browseReturnNodeId: browseReturn.browseReturnNodeId,
    browsedFolderNodeId: args.browsedFolderNodeId,
    floatingBar: args.floatingBar,
    setActiveAction: args.setActiveAction,
    setBrowseReturnNodeId: browseReturn.setBrowseReturnNodeId,
    setReadingError: args.setReadingError,
    setReviewError: args.setReviewError,
    setSelectedBrowseNodeId: args.setSelectedBrowseNodeId,
    snapshot: args.snapshot,
    workspaceSync: args.workspaceSync
  });
}

function useCompanionInteractionState(
  browsedFolderNodeId: string | null,
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
  const { handleExitBrowseArticle, handleSelectBrowseNode, handleSelectRecentArticle, handleTabAction } = useCompanionBrowseActions({
    browsedFolderNodeId,
    floatingBar,
    setActiveAction,
    setReadingError,
    setReviewError,
    setSelectedBrowseNodeId,
    snapshot,
    workspaceSync
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
    handleExitBrowseArticle,
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

export function useCompanionArticleSurface(
  workspaceSync: CompanionWorkspaceSyncApi,
  floatingBar: FloatingBarVisibilityApi,
  browseSort?: CompanionBrowseSortState
) {
  const [activeAction, setActiveAction] = useState<CompanionTabAction>(() => {
    return workspaceSync.state.workspace_snapshot ? 'review' : 'more';
  });
  const browseState = useCompanionBrowseState(workspaceSync, browseSort);
  const handleViewScroll = useCompanionViewStateSync({
    activeAction,
    readableArticleNodeId: browseState.readableArticle?.nodeId ?? null,
    reviewNodeId: browseState.reviewSession.currentCard?.nodeId ?? null,
    selectedBrowseNodeId: browseState.selectedBrowseNodeId
  });
  const interactionState = useCompanionInteractionState(
    browseState.browsedFolder?.nodeId ?? null,
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
