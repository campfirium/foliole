import { useMemo } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import {
  type CompanionRecentArticle,
  resolveCompanionRecentArticles
} from '../shared/platform/companionBrowseLists';

import { resolveCompanionReviewSession } from './companionReviewSession';
import { useCompanionBrowseSelection } from './useCompanionBrowseSelection';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;
export type CompanionBrowseSortState = {
  sortDirection: FolderListSortDirection;
  sortKey: FolderListSortKey;
};

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

export function useCompanionBrowseState(
  workspaceSync: CompanionWorkspaceSyncApi,
  sort: CompanionBrowseSortState = {
    sortDirection: DEFAULT_FOLDER_LIST_SORT_DIRECTION,
    sortKey: DEFAULT_FOLDER_LIST_SORT_KEY
  }
) {
  const snapshot = workspaceSync.state.workspace_snapshot;
  const recentArticles = useMemo(() => {
    const articles = resolveCompanionRecentArticles(snapshot, sort.sortKey, sort.sortDirection);
    return articles.length > 0 ? articles : buildReadableArticleFallback(workspaceSync.readableArticle);
  }, [snapshot, sort.sortDirection, sort.sortKey, workspaceSync.readableArticle]);
  const reviewSession = useMemo(() => resolveCompanionReviewSession(snapshot), [snapshot]);
  const { browsedFolder, readableArticle, selectedBrowseNodeId, setSelectedBrowseNodeId } = useCompanionBrowseSelection(
    snapshot,
    workspaceSync.readableArticle,
    sort
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
