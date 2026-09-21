import { useCallback, useEffect, useRef } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';
import { loadCompanionReadableArticle } from '../shared/platform/companionWorkspaceSync';

export function useCompanionReadableArticleLoader(
  snapshot: WorkspaceSnapshot | null,
  setReadableArticle: (article: CompanionReadableArticle | null) => void
) {
  const requestRevision = useRef(0);

  useEffect(() => () => {
    requestRevision.current += 1;
  }, []);

  return useCallback(async (nodeId: string) => {
    const revision = requestRevision.current + 1;
    requestRevision.current = revision;
    const article = await loadCompanionReadableArticle(snapshot, nodeId);
    if (requestRevision.current === revision) setReadableArticle(article);
    return article;
  }, [setReadableArticle, snapshot]);
}
