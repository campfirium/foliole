import { useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY
} from '../features/nodes/model/folderListOrdering';
import { resolveCompanionFolderViewByNodeId } from '../shared/platform/companionBrowseLists';
import { resolveReadableCompanionArticleByNodeId } from '../shared/platform/companionReadableArticle';

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
  const [selectedBrowseNodeId, setSelectedBrowseNodeId] = useState<string | null>(null);
  const resolvedReadableArticle = useMemo(
    () => {
      if (!selectedBrowseNodeId) {
        return readableArticle;
      }
      if (readableArticle?.nodeId === selectedBrowseNodeId) {
        return readableArticle;
      }
      return resolveReadableCompanionArticleByNodeId(snapshot, selectedBrowseNodeId);
    },
    [readableArticle, selectedBrowseNodeId, snapshot]
  );
  const browsedFolder = useMemo(
    () => resolveCompanionFolderViewByNodeId(snapshot, selectedBrowseNodeId, sort.sortKey, sort.sortDirection),
    [selectedBrowseNodeId, snapshot, sort.sortDirection, sort.sortKey]
  );

  useEffect(() => {
    if (selectedBrowseNodeId && !resolvedReadableArticle && !browsedFolder) {
      setSelectedBrowseNodeId(null);
    }
  }, [browsedFolder, resolvedReadableArticle, selectedBrowseNodeId]);

  return {
    browsedFolder,
    readableArticle: resolvedReadableArticle,
    selectedBrowseNodeId,
    setSelectedBrowseNodeId
  };
}
