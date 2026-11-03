import { useMemo, useRef } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY,
  type FolderListSortDirection,
  type FolderListSortKey
} from '../features/nodes/model/folderListOrdering';
import { resolveCompanionBrowseSnapshot } from '../shared/platform/companion/browse/companionBrowseSnapshot';
import {
  type CompanionRecentArticle,
  resolveCompanionRecentArticles
} from '../shared/platform/companionBrowseLists';

import type { CompanionTabAction } from './CompanionFloatingBars';
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
  },
  display: { activeAction: CompanionTabAction; flowNodeId: string | null } = { activeAction: 'recent', flowNodeId: null }
) {
  const snapshot = workspaceSync.state.workspace_snapshot;
  const browseSnapshot = resolveCompanionBrowseSnapshot(snapshot);
  const { browsedFolder, readableArticle, selectedBrowseNodeId, setSelectedBrowseNodeId } = useCompanionBrowseSelection(
    snapshot,
    workspaceSync.readableArticle,
    sort
  );
  const needsRecentArticles = display.activeAction === 'recent' || (display.activeAction === 'review' &&
    selectedBrowseNodeId !== null && selectedBrowseNodeId !== display.flowNodeId);
  const projection = useRef<{ snapshot: typeof browseSnapshot; sortKey: typeof sort.sortKey;
    sortDirection: typeof sort.sortDirection; articles: CompanionRecentArticle[] } | null>(null);
  const projectedArticles = useMemo(() => {
    if (!needsRecentArticles) return projection.current?.articles ?? [];
    const previous = projection.current;
    if (previous && previous.snapshot === browseSnapshot && previous.sortKey === sort.sortKey &&
      previous.sortDirection === sort.sortDirection) return previous.articles;
    const articles = resolveCompanionRecentArticles(browseSnapshot, sort.sortKey, sort.sortDirection);
    projection.current = { snapshot: browseSnapshot, ...sort, articles };
    return articles;
  }, [browseSnapshot, needsRecentArticles, sort.sortDirection, sort.sortKey]);
  const recentArticles = useMemo(() => projectedArticles.length > 0
    ? projectedArticles : buildReadableArticleFallback(workspaceSync.readableArticle),
  [projectedArticles, workspaceSync.readableArticle]);

  return {
    browsedFolder,
    readableArticle,
    recentArticles,
    selectedBrowseNodeId,
    setSelectedBrowseNodeId,
    snapshot
  };
}
