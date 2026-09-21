import { useMemo } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { CompanionReadableArticle } from '../shared/platform/companionReadableArticle';

export function useCompanionLoadedNodeSnapshot(
  snapshot: WorkspaceSnapshot | null,
  article: CompanionReadableArticle
) {
  return useMemo(() => {
    const loaded = article.loadedNodeContentById;
    if (!snapshot || !loaded || Object.keys(loaded).length === 0) return snapshot;
    return {
      ...snapshot,
      nodesById: Object.fromEntries(Object.entries(snapshot.nodesById).map(([nodeId, node]) => [
        nodeId,
        loaded[nodeId] === undefined ? node : { ...node, content: loaded[nodeId] }
      ]))
    };
  }, [article, snapshot]);
}
