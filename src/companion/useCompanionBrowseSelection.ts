import { useEffect, useMemo, useState } from 'react';

import {
  resolveCompanionFolderViewByNodeId,
  resolveReadableCompanionArticleByNodeId
} from '../shared/platform/companionReadableArticle';

import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';

type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function useCompanionBrowseSelection(
  snapshot: CompanionWorkspaceSyncApi['state']['workspace_snapshot'],
  readableArticle: CompanionWorkspaceSyncApi['readableArticle']
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
    () => resolveCompanionFolderViewByNodeId(snapshot, selectedBrowseNodeId),
    [selectedBrowseNodeId, snapshot]
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
