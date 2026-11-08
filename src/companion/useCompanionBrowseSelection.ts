import { useEffect, useMemo } from 'react';

import {
  DEFAULT_FOLDER_LIST_SORT_DIRECTION,
  DEFAULT_FOLDER_LIST_SORT_KEY
} from '../features/nodes/model/folderListOrdering';
import { resolveCompanionBrowseSnapshot } from '../shared/platform/companion/browse/companionBrowseSnapshot';
import { retainCompanionOpenVirtualFolder } from '../shared/platform/companion/browse/companionOpenVirtualFolders';
import { applyCompanionFolderTopicFocus } from '../shared/platform/companion/browse/companionTopicFocus';
import {
  resolveCompanionFolderViewByNodeId,
  resolveCompanionTrashFolderViewByNodeId
} from '../shared/platform/companionBrowseLists';
import {
  resolveReadableCompanionArticleByNodeId,
  resolveReadableCompanionTrashArticleByNodeId
} from '../shared/platform/companionReadableArticle';
import { useDismissedTopicVisibility } from '../shared/platform/useDismissedTopicVisibility';

import { useCompanionNavigationField } from './CompanionNavigationProvider';
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
  const { viewHideDismissedTopics } = useDismissedTopicVisibility();
  const browseSnapshot = resolveCompanionBrowseSnapshot(snapshot);
  const [selectedBrowseNodeId, setSelectedBrowseNodeId] = useCompanionNavigationField('selectedBrowseNodeId', null);
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
    () => {
      const folder = resolveCompanionFolderViewByNodeId(browseSnapshot, selectedBrowseNodeId, sort.sortKey, sort.sortDirection);
      if (folder) return viewHideDismissedTopics ? applyCompanionFolderTopicFocus(browseSnapshot, folder) : folder;
      return resolveCompanionTrashFolderViewByNodeId(browseSnapshot, selectedBrowseNodeId, sort.sortKey, sort.sortDirection);
    },
    [selectedBrowseNodeId, browseSnapshot, sort.sortDirection, sort.sortKey, viewHideDismissedTopics]
  );

  useEffect(() => selectedBrowseNodeId ? retainCompanionOpenVirtualFolder(selectedBrowseNodeId) : undefined,
    [selectedBrowseNodeId]);

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
