import { useMemo } from 'react';

import {
  type CompanionRecentArticle,
  resolveCompanionRecentArticles
} from '../shared/platform/companionReadableArticle';

import { resolveCompanionReviewSession } from './companionReviewSession';
import { useCompanionBrowseSelection } from './useCompanionBrowseSelection';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

function buildReadableArticleFallback(
  readableArticle: CompanionWorkspaceSyncApi['readableArticle']
): CompanionRecentArticle[] {
  if (!readableArticle) {
    return [];
  }
  return [{
    nodeId: readableArticle.nodeId,
    preview: null,
    title: readableArticle.title,
    updatedAt: ''
  }];
}

export function useCompanionBrowseState(workspaceSync: CompanionWorkspaceSyncApi) {
  const snapshot = workspaceSync.state.workspace_snapshot;
  const recentArticles = useMemo(() => {
    const articles = resolveCompanionRecentArticles(snapshot);
    return articles.length > 0 ? articles : buildReadableArticleFallback(workspaceSync.readableArticle);
  }, [snapshot, workspaceSync.readableArticle]);
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
