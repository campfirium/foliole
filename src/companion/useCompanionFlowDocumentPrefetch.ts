import { useEffect } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { resolveNextDocumentId } from '../shared/lib/documents/documentPreparation';
import { prepareCompanionFlowArticle } from '../shared/platform/companion/reading/companionArticlePreparation';

export function useCompanionFlowDocumentPrefetch(snapshot: WorkspaceSnapshot | null,
  currentNodeId: string | null, queueNodeIds: string[]) {
  const nextNodeId = resolveNextDocumentId(currentNodeId, queueNodeIds);
  useEffect(() => {
    prepareCompanionFlowArticle(snapshot, nextNodeId, currentNodeId);
  }, [snapshot, nextNodeId, currentNodeId]);
  useEffect(() => () => prepareCompanionFlowArticle(null, null), []);
}
