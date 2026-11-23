import { useCallback, useEffect, useMemo, useState } from 'react';

import type { StoredAnchorLink } from '../../lib/core/database/anchorLinkCodec';
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
import { useDismissedTopicVisibility } from '../shared/platform/runtime/useDismissedTopicVisibility';

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
  const [selectedBrowseNodeId, selectNode] = useCompanionNavigationField('selectedBrowseNodeId', null);
  const [breadcrumbJump, setBreadcrumbJump] = useState<{
    nodeId: string; libraryScope: string | undefined; anchor: StoredAnchorLink;
  } | null>(null);

  const libraryScope = snapshot?.libraryScope;
  const setSelectedBrowseNodeId = useCallback((nodeId: string | null, anchor?: StoredAnchorLink) => {
    setBreadcrumbJump(nodeId && anchor ? { nodeId, libraryScope, anchor } : null);
    selectNode(nodeId);
  }, [libraryScope, selectNode]);
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
  }, [browsedFolder, resolvedReadableArticle, selectedBrowseNodeId, setSelectedBrowseNodeId, snapshot]);

  return {
    breadcrumbAnchor: breadcrumbJump && breadcrumbJump.nodeId === selectedBrowseNodeId &&
      breadcrumbJump.libraryScope === libraryScope ? breadcrumbJump.anchor : null,
    browsedFolder,
    readableArticle: resolvedReadableArticle,
    selectedBrowseNodeId,
    setSelectedBrowseNodeId
  };
}
