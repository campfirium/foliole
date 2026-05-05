import { useMemo } from 'react';

import { resolveCompanionRecentArticles } from '../shared/platform/companionReadableArticle';

import { resolveCompanionReviewSession } from './companionReviewSession';
import { useCompanionBrowseSelection } from './useCompanionBrowseSelection';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function useCompanionBrowseState(workspaceSync: CompanionWorkspaceSyncApi) {
  const snapshot = workspaceSync.state.workspace_snapshot;
  const recentArticles = useMemo(() => resolveCompanionRecentArticles(snapshot), [snapshot]);
  const reviewSession = useMemo(() => resolveCompanionReviewSession(snapshot), [snapshot]);
  const { browsedFolder, readableArticle, selectedBrowseNodeId, setSelectedBrowseNodeId } = useCompanionBrowseSelection(
    snapshot,
    workspaceSync.readableArticle
  );

  return {
    browsedFolder,
    readableArticle,
    recentArticles,
    reviewSession,
    selectedBrowseNodeId,
    setSelectedBrowseNodeId,
    snapshot
  };
}
