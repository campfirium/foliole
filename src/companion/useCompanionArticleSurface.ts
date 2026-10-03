import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import type { CompanionTabAction } from './CompanionFloatingBars';
import { CompanionReadingActivity } from './companionReadingActivity';
import { hydrateCompanionReviewSession } from './companionReviewSession';
import { useCompanionActionState } from './useCompanionActionState';
import type { CompanionBrowseSortState } from './useCompanionBrowseState';
import { useCompanionBrowseState } from './useCompanionBrowseState';
import { useCompanionFlowSession } from './useCompanionFlowSession';
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
  flow: ReturnType<typeof useCompanionFlowSession>,
  activity: CompanionReadingActivity,
  active: boolean,
  setActiveAction: (action: CompanionTabAction) => void,
  setSelectedBrowseNodeId: (nodeId: string | null) => void,
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'],
  workspaceSync: CompanionWorkspaceSyncApi
) {
  const { setReadingError, setReviewError, ...reviewActions } = useCompanionSurfaceActions({
    floatingBar,
    flow,
    activity,
    active,
    snapshot,
    workspaceSync
  });
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

  return {
    ...reviewActions,
    handleRevealAnswer: flow.reveal,
    handleExitBrowseArticle,
    handleExitDirectoryArticle,
    handleExitSearchArticle,
    handleSelectBrowseNode,
    handleSelectRecentArticle,
    handleTabAction,
    isAnswerRevealed: flow.isAnswerRevealed
  };
}

function useReadableArticleWithBodySyncStatus(
  readableArticle: CompanionWorkspaceSyncApi['readableArticle'],
  workspaceSync: CompanionWorkspaceSyncApi
) {
  const { fetchingBodyKey } = useCompanionMissingBodySync({ readableArticle, workspaceSync });
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
  const flow = useCompanionFlowSession({
    snapshot: browseState.snapshot, ready: workspaceSync.isWorkspaceSyncStateReady,
    active: activeAction === 'review', onlyReview: options.isOnlyReviewOpen === true,
    libraryScope: browseState.snapshot?.libraryScope ?? workspaceSync.bootstrapState.database_path ?? 'preview'
  });
  const demandNodeId = activeAction === 'review' ? flow.view.currentCard?.nodeId ?? null
    : activeAction === 'recent' && !browseState.browsedFolder ? browseState.selectedBrowseNodeId : null;
  const readingActivity = useReadingActivity(demandNodeId, browseState.snapshot?.libraryScope);
  const readyDemandNodeId = workspaceSync.isWorkspaceSyncStateReady ? demandNodeId : null;
  const currentArticle = useCompanionDemandArticle(workspaceSync, browseState.readableArticle,
    activeAction, readyDemandNodeId);
  const effectiveReviewSession = useMemo(
    () => hydrateCompanionReviewSession(flow.view, currentArticle),
    [flow.view, currentArticle]
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
    flow,
    readingActivity,
    activeAction === 'review',
    setUserActiveAction,
    browseState.setSelectedBrowseNodeId,
    browseState.snapshot,
    workspaceSync
  );

  const readableArticle = useReadableArticleWithBodySyncStatus(
    currentArticle,
    workspaceSync
  );

  return {
    activeAction,
    browsedFolder: browseState.browsedFolder,
    readableArticle,
    recentArticles: browseState.recentArticles,
    effectiveReviewSession,
    onlyReviewSession: effectiveReviewSession,
    reviewSession: effectiveReviewSession,
    readingActivity,
    flowError: flow.error,
    flowReady: flow.ready,
    selectedBrowseNodeId: browseState.selectedBrowseNodeId,
    handleViewScroll,
    ...interactionState
  };
}

function useCompanionDemandArticle(workspaceSync: CompanionWorkspaceSyncApi,
  browseArticle: CompanionWorkspaceSyncApi['readableArticle'], activeAction: CompanionTabAction,
  readyDemandNodeId: string | null) {
  useEffect(() => {
    void Promise.resolve(workspaceSync.openReadableArticle(readyDemandNodeId)).catch(() => undefined);
  }, [readyDemandNodeId, workspaceSync.openReadableArticle]);
  const candidate = activeAction === 'review' ? workspaceSync.readableArticle : browseArticle;
  return candidate?.nodeId === readyDemandNodeId ? candidate : null;
}

function useReadingActivity(nodeId: string | null, libraryScope: string | undefined) {
  const [, changed] = useReducer((value: number) => value + 1, 0);
  return useMemo(() => new CompanionReadingActivity(nodeId, changed), [nodeId, libraryScope]);
}
