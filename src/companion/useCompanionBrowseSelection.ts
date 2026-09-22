import { useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY
} from '../features/nodes/model/folderListOrdering';
import { resolveCompanionBrowseSnapshot } from '../shared/platform/companion/browse/companionBrowseSnapshot';
import {
  resolveCompanionFolderViewByNodeId,
  resolveCompanionTrashFolderViewByNodeId
} from '../shared/platform/companionBrowseLists';
import {
  resolveReadableCompanionArticleByNodeId,
  resolveReadableCompanionTrashArticleByNodeId
} from '../shared/platform/companionReadableArticle';

import type { CompanionBrowseSortState } from './useCompanionBrowseState';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function useCompanionBrowseSelection(
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'],
  readableArticle: CompanionWorkspaceSyncApi['readableArticle'],
  sort: CompanionBrowseSortState = {
    sortDirection: DEFAULT_FOLDER_LIST_SORT_DIRECTION,
    sortKey: DEFAULT_FOLDER_LIST_SORT_KEY
  }
) {
  const browseSnapshot = resolveCompanionBrowseSnapshot(snapshot);
  const [selectedBrowseNodeId, setSelectedBrowseNodeId] = useState<string | null>(null);
  const resolvedReadableArticle = useMemo(
    () => {
      if (!selectedBrowseNodeId) {
        return readableArticle;
      }
      if (readableArticle?.nodeId === selectedBrowseNodeId) {
        return readableArticle;
      }
      return resolveReadableCompanionArticleByNodeId(snapshot, selectedBrowseNodeId) ??
        resolveReadableCompanionTrashArticleByNodeId(snapshot, selectedBrowseNodeId);
    },
    [readableArticle, selectedBrowseNodeId, snapshot]
  );
  const browsedFolder = useMemo(
    () => resolveCompanionFolderViewByNodeId(browseSnapshot, selectedBrowseNodeId, sort.sortKey, sort.sortDirection) ??
      resolveCompanionTrashFolderViewByNodeId(browseSnapshot, selectedBrowseNodeId, sort.sortKey, sort.sortDirection),
    [selectedBrowseNodeId, browseSnapshot, sort.sortDirection, sort.sortKey]
  );

  useEffect(() => {
    if (selectedBrowseNodeId && !snapshot?.nodesById[selectedBrowseNodeId] && !resolvedReadableArticle && !browsedFolder) {
      setSelectedBrowseNodeId(null);
    }
  }, [browsedFolder, resolvedReadableArticle, selectedBrowseNodeId, snapshot]);

  return {
    browsedFolder,
    readableArticle: resolvedReadableArticle,
    selectedBrowseNodeId,
    setSelectedBrowseNodeId
  };
}
