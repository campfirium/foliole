import { useEffect, useMemo, useState } from 'react';

import {
  resolveCompanionRecentArticles,
  resolveReadableCompanionArticleByNodeId
} from '../shared/platform/companionReadableArticle';

import type { TopBarAction } from './CompanionFloatingBars';
import type { useCompanionWorkspaceSync } from './useCompanionWorkspaceSync';
import type { useFloatingBarVisibility } from './useFloatingBarVisibility';

type FloatingBarVisibilityApi = ReturnType<typeof useFloatingBarVisibility>;
type CompanionWorkspaceSyncApi = ReturnType<typeof useCompanionWorkspaceSync>;

export function useCompanionArticleSurface(
  workspaceSync: CompanionWorkspaceSyncApi,
  floatingBar: FloatingBarVisibilityApi
) {
  const snapshot = workspaceSync.state.workspace_snapshot;
  const recentArticles = useMemo(() => resolveCompanionRecentArticles(snapshot), [snapshot]);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<TopBarAction>('review');
  const readableArticle = useMemo(
    () =>
      resolveReadableCompanionArticleByNodeId(snapshot, selectedArticleId) ??
      workspaceSync.readableArticle,
    [selectedArticleId, snapshot, workspaceSync.readableArticle]
  );

  useEffect(() => {
    if (!readableArticle) {
      setSelectedArticleId(null);
      return;
    }
    if (!selectedArticleId || !recentArticles.some((article) => article.nodeId === selectedArticleId)) {
      setSelectedArticleId(readableArticle.nodeId);
    }
  }, [readableArticle, recentArticles, selectedArticleId]);

  function handleTopBarAction(action: TopBarAction) {
    setActiveAction(action);
    if (action === 'recent') {
      floatingBar.revealBar();
    }
  }

  function handleSelectRecentArticle(nodeId: string) {
    setSelectedArticleId(nodeId);
    setActiveAction('review');
    floatingBar.revealBar();
  }

  return {
    activeAction,
    handleSelectRecentArticle,
    handleTopBarAction,
    readableArticle,
    recentArticles
  };
}
