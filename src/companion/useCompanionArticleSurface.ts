import { useEffect, useMemo, useReducer, useRef } from 'react';

import { createCompanionDiveEntry } from './companionDiveFlowControls';
import type { CompanionTabAction } from './CompanionFloatingBars';
import { useCompanionNavigationField, useCompanionNavigationFlush, useHasCompanionNavigation } from './CompanionNavigationProvider';
import { CompanionReadingActivity } from './companionReadingActivity';
import { hydrateCompanionReviewSession } from './companionReviewSession';
import { useCompanionActionState } from './useCompanionActionState';
import type { CompanionBrowseSortState } from './useCompanionBrowseState';
import { useCompanionBrowseState } from './useCompanionBrowseState';
import { useCompanionFlowBodyTiming } from './useCompanionFlowBodyTiming';
import { useCompanionFlowSession } from './useCompanionFlowSession';
import { useCompanionSurfaceActions } from './useCompanionSurfaceActions';
import { useExitUnavailableDive } from './useCompanionUnavailableDive';
import { useCompanionViewStateSync } from './useCompanionViewStateSync';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import type { useFloatingBarVisibility } from './useFloatingBarVisibility';

type FloatingBarVisibilityApi = ReturnType<typeof useFloatingBarVisibility>;
type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

type ActionStateArgs = Parameters<typeof useCompanionActionState>[0];
type BacklinkReturnState = Pick<ActionStateArgs, 'backlinkReturnNodeIds' | 'setBacklinkReturnNodeIds'>;

function useCompanionBrowseActions(args: Omit<ActionStateArgs, 'browseReturnNodeId' | 'setBrowseReturnNodeId'>) {
  const [browseReturnNodeId, setBrowseReturnNodeId] = useCompanionNavigationField('browseReturnNodeId', null);
  return { ...useCompanionActionState({ ...args, browseReturnNodeId, setBrowseReturnNodeId }), browseReturnNodeId };
}

function useCompanionInteractionState(
  browsedFolderNodeId: string | null,
  floatingBar: FloatingBarVisibilityApi,
  flow: ReturnType<typeof useCompanionFlowSession>,
  activity: CompanionReadingActivity,
  activeAction: CompanionTabAction,
  isFlowBrowsing: boolean,
  setActiveAction: (action: CompanionTabAction) => void,
  browse: ReturnType<typeof useCompanionBrowseState>,
  workspaceSync: CompanionWorkspaceSyncApi,
  backlinkReturn: BacklinkReturnState
) {
  const { breadcrumbAnchor, setSelectedBrowseNodeId, snapshot } = browse;
  const { setReadingError, setReviewError, ...reviewActions } = useCompanionSurfaceActions({
    floatingBar,
    flow,
    activity,
    active: activeAction === 'review' && !isFlowBrowsing,
    snapshot,
    workspaceSync
  });
  const browseActions = useCompanionBrowseActions({
    ...backlinkReturn,
    activeAction,
    browsedFolderNodeId,
    flowNodeId: flow.view.currentCard?.nodeId ?? null,
    selectedBrowseNodeId: browse.selectedBrowseNodeId,
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
    ...browseActions,
    breadcrumbAnchor,
    handleRevealAnswer: flow.reveal,
    handleContinueReading: flow.continueReading,
    canContinueReading: flow.canContinueReading,
    handleResumeFlow: () => browseActions.handleTabAction('review'),
    isAnswerRevealed: flow.isAnswerRevealed
  };
}

function useCompanionActiveAction(workspaceSync: CompanionWorkspaceSyncApi) {
  const restored = useHasCompanionNavigation();
  const isActiveActionUserOwnedRef = useRef(false);
  const [activeAction, setActiveAction] = useCompanionNavigationField('activeAction', workspaceSync.state.workspace_snapshot ? 'review' : 'more');
  const setUserActiveAction = (action: CompanionTabAction) => {
    isActiveActionUserOwnedRef.current = true;
    setActiveAction(action);
  };
  useEffect(() => {
    if (restored || !workspaceSync.isWorkspaceSyncStateReady) return;
    if (!workspaceSync.state.workspace_snapshot) {
      setActiveAction('more');
      isActiveActionUserOwnedRef.current = false;
      return;
    }
    if (!isActiveActionUserOwnedRef.current) setActiveAction('review');
  }, [workspaceSync.isWorkspaceSyncStateReady, workspaceSync.state.workspace_snapshot]);
  return { activeAction, setUserActiveAction };
}

function useCompanionSurfaceFlow(workspaceSync: CompanionWorkspaceSyncApi,
  activeAction: CompanionTabAction) {
  return useCompanionFlowSession({
    snapshot: workspaceSync.state.workspace_snapshot, ready: workspaceSync.isWorkspaceSyncStateReady,
    active: activeAction === 'review',
    libraryScope: workspaceSync.state.workspace_snapshot?.libraryScope ?? workspaceSync.bootstrapState.database_path ?? 'preview'
  });
}

export function useCompanionArticleSurface(
  workspaceSync: CompanionWorkspaceSyncApi,
  floatingBar: FloatingBarVisibilityApi,
  browseSort?: CompanionBrowseSortState
) {
  const { activeAction, setUserActiveAction } = useCompanionActiveAction(workspaceSync);
  const flow = useCompanionSurfaceFlow(workspaceSync, activeAction);
  const [backlinkReturnNodeIds, setBacklinkReturnNodeIds] = useCompanionNavigationField('backlinkReturnNodeIds', []);
  const followingBacklink = backlinkReturnNodeIds.length > 0;
  const browseState = useCompanionBrowseState(workspaceSync, browseSort, { activeAction,
    flowNodeId: flow.view.currentCard?.nodeId ?? null, followingBacklink });
  const { currentArticle, readingActivity, articleAction, isFlowBrowsing } = useCompanionDemandArticle(
    workspaceSync, browseState, activeAction, flow, followingBacklink);
  const effectiveReviewSession = useMemo(
    () => hydrateCompanionReviewSession(flow.view, currentArticle),
    [flow.view, currentArticle]
  );
  const handleViewScroll = useCompanionViewStateSync({
    activeAction: articleAction,
    readableArticleNodeId: browseState.readableArticle?.nodeId ?? null,
    reviewNodeId: effectiveReviewSession.currentCard?.nodeId ?? null,
    selectedBrowseNodeId: browseState.selectedBrowseNodeId
  });
  useReadingPositionFlush(readingActivity, handleViewScroll);
  const interactionState = useCompanionInteractionState(
    browseState.browsedFolder?.nodeId ?? null,
    floatingBar,
    flow,
    readingActivity,
    activeAction,
    isFlowBrowsing,
    setUserActiveAction,
    browseState,
    workspaceSync,
    { backlinkReturnNodeIds, setBacklinkReturnNodeIds }
  );
  useExitUnavailableDive(flow, activeAction, workspaceSync, interactionState);

  return {
    activeAction,
    isFlowBrowsing,
    browsedFolder: browseState.browsedFolder,
    readableArticle: currentArticle,
    recentArticles: browseState.recentArticles,
    effectiveReviewSession,
    reviewSession: effectiveReviewSession,
    readingActivity,
    diveFlow: flow.dive,
    openDiveFlow: createCompanionDiveEntry(flow.openDive, readingActivity, interactionState),
    flowSessionMode: flow.mode,
    setFlowSessionMode: flow.setMode,
    flowSummary: flow.summary,
    flowError: flow.error,
    flowReady: flow.ready,
    flowHasTopics: flow.hasTopics,
    flowHistoryKey: flow.historyKey,
    ...flow.workspaceHistoryControls,
    selectedBrowseNodeId: browseState.selectedBrowseNodeId,
    handleViewScroll,
    ...interactionState
  };
}

function useCompanionDemandArticle(workspaceSync: CompanionWorkspaceSyncApi,
  browse: ReturnType<typeof useCompanionBrowseState>, tabAction: CompanionTabAction,
  flow: ReturnType<typeof useCompanionFlowSession>, followingBacklink: boolean) {
  const reviewNodeId = flow.view.currentCard?.nodeId ?? null;
  const isFlowBrowsing = tabAction === 'review' && browse.selectedBrowseNodeId !== null
    && (followingBacklink || browse.selectedBrowseNodeId !== reviewNodeId);
  const activeAction = isFlowBrowsing ? 'recent' : tabAction;
  const demandNodeId = activeAction === 'review' ? reviewNodeId
    : activeAction === 'recent' && !browse.browsedFolder ? browse.selectedBrowseNodeId : null;
  const readingActivity = useReadingActivity(demandNodeId, browse.snapshot?.libraryScope);
  const readyDemandNodeId = workspaceSync.isWorkspaceSyncStateReady ? demandNodeId : null;
  useEffect(() => {
    void Promise.resolve(workspaceSync.openReadableArticle(readyDemandNodeId)).catch(() => undefined);
  }, [readyDemandNodeId, workspaceSync.openReadableArticle]);
  const candidate = activeAction === 'review' ? workspaceSync.readableArticle : browse.readableArticle;
  const currentArticle = candidate?.nodeId === readyDemandNodeId ? candidate : null;
  useCompanionFlowBodyTiming(flow.displayTiming, flow.bodyTargetNodeId, currentArticle, readingActivity, activeAction === 'review');
  return { currentArticle,
    readingActivity, articleAction: activeAction, isFlowBrowsing };
}

function useReadingActivity(nodeId: string | null, libraryScope: string | undefined) {
  const [, changed] = useReducer((value: number) => value + 1, 0);
  return useMemo(() => new CompanionReadingActivity(nodeId, changed), [nodeId, libraryScope]);
}

function useReadingPositionFlush(activity: CompanionReadingActivity,
  scroll: ReturnType<typeof useCompanionViewStateSync>) {
  const flushNavigation = useCompanionNavigationFlush();
  useEffect(() => {
    activity.flushPosition = async () => { await scroll.flush(); await flushNavigation(); };
    return () => { activity.flushPosition = null; };
  }, [activity, scroll.flush, flushNavigation]);
}
