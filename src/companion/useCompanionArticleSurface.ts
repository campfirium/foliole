import { useEffect, useMemo, useRef, useState } from 'react';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { resolveCompanionFsrsReviewSession } from './companionFsrsReviewSession';
import { hydrateCompanionReviewSession, resolveCompanionReviewSession } from './companionReviewSession';
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
  const { setReadingError, setReviewError, ...reviewActions } = useCompanionSurfaceActions({
    floatingBar,
    reviewSession,
    snapshot,
    workspaceSync
  });
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const {
    handleExitBrowseArticle,
    handleExitDirectoryArticle,
    handleExitSearchArticle,
    handleSelectBrowseNode,
    handleSelectRecentArticle,
    handleTabAction
  } = useCompanionBrowseActions({
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
    ...reviewActions,
    handleRevealAnswer,
    handleExitBrowseArticle,
    handleExitDirectoryArticle,
    handleExitSearchArticle,
    handleSelectBrowseNode,
    handleSelectRecentArticle,
    handleTabAction,
    isAnswerRevealed
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

function useCompanionEffectiveReviewSession(args: {
  isOnlyReviewOpen?: boolean | undefined;
  reviewSession: ReturnType<typeof resolveCompanionReviewSession>;
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'];
}) {
  const onlyReviewSession = useMemo(
    () => resolveCompanionFsrsReviewSession(args.snapshot),
    [args.snapshot]
  );
  const effectiveReviewSession = args.isOnlyReviewOpen ? onlyReviewSession : args.reviewSession;
  return { effectiveReviewSession, onlyReviewSession };
}

function useCompanionActiveAction(workspaceSync: CompanionWorkspaceSyncApi) {
  const isActiveActionUserOwnedRef = useRef(false);
  const [activeAction, setActiveAction] = useState<CompanionTabAction>(() => {
    return workspaceSync.state.workspace_snapshot ? 'review' : 'more';
  });
  const setUserActiveAction = (action: CompanionTabAction) => {
    isActiveActionUserOwnedRef.current = true;
    setActiveAction(action);
  };
  useEffect(() => {
    if (!workspaceSync.isWorkspaceSyncStateReady) return;
    if (!workspaceSync.state.workspace_snapshot) {
      setActiveAction('more');
      isActiveActionUserOwnedRef.current = false;
      return;
    }
    if (!isActiveActionUserOwnedRef.current) setActiveAction('review');
  }, [workspaceSync.isWorkspaceSyncStateReady, workspaceSync.state.workspace_snapshot]);
  return { activeAction, setUserActiveAction };
}

export function useCompanionArticleSurface(
  workspaceSync: CompanionWorkspaceSyncApi,
  floatingBar: FloatingBarVisibilityApi,
  browseSort?: CompanionBrowseSortState,
  options: { isOnlyReviewOpen?: boolean } = {}
) {
  const { activeAction, setUserActiveAction } = useCompanionActiveAction(workspaceSync);
  const browseState = useCompanionBrowseState(workspaceSync, browseSort);
  const reviewSessions = useCompanionEffectiveReviewSession({
    isOnlyReviewOpen: options.isOnlyReviewOpen,
    reviewSession: browseState.reviewSession,
    snapshot: browseState.snapshot
  });
  const demandNodeId = options.isOnlyReviewOpen || activeAction === 'review'
    ? reviewSessions.effectiveReviewSession.currentCard?.nodeId ?? null
    : activeAction === 'recent' && !browseState.browsedFolder ? browseState.selectedBrowseNodeId : null;
  const readyDemandNodeId = workspaceSync.isWorkspaceSyncStateReady ? demandNodeId : null;
  useEffect(() => {
    void Promise.resolve(workspaceSync.openReadableArticle(readyDemandNodeId)).catch(() => undefined);
  }, [readyDemandNodeId, workspaceSync.openReadableArticle]);
  const candidateArticle = options.isOnlyReviewOpen || activeAction === 'review'
    ? workspaceSync.readableArticle : browseState.readableArticle;
  const currentArticle = candidateArticle?.nodeId === readyDemandNodeId ? candidateArticle : null;
  const effectiveReviewSession = useMemo(
    () => hydrateCompanionReviewSession(reviewSessions.effectiveReviewSession, currentArticle),
    [reviewSessions.effectiveReviewSession, currentArticle]
  );
  const handleViewScroll = useCompanionViewStateSync({
    activeAction,
    readableArticleNodeId: browseState.readableArticle?.nodeId ?? null,
    reviewNodeId: effectiveReviewSession.currentCard?.nodeId ?? null,
    selectedBrowseNodeId: browseState.selectedBrowseNodeId
  });
  const interactionState = useCompanionInteractionState(
    browseState.browsedFolder?.nodeId ?? null,
    floatingBar,
    effectiveReviewSession,
    setUserActiveAction,
    browseState.setSelectedBrowseNodeId,
    browseState.snapshot,
    workspaceSync
  );

  const missingBodySync = useCompanionMissingBodySync({ readableArticle: currentArticle, workspaceSync });
  const readableArticle = useReadableArticleWithBodySyncStatus(
    currentArticle,
    missingBodySync.fetchingBodyKey
  );

  return {
    activeAction,
    browsedFolder: browseState.browsedFolder,
    readableArticle,
    recentArticles: browseState.recentArticles,
    effectiveReviewSession,
    onlyReviewSession: options.isOnlyReviewOpen ? effectiveReviewSession : reviewSessions.onlyReviewSession,
    reviewSession: options.isOnlyReviewOpen ? browseState.reviewSession : effectiveReviewSession,
    selectedBrowseNodeId: browseState.selectedBrowseNodeId,
    handleViewScroll,
    ...interactionState
  };
}
