import { useCallback, useRef } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import { useFlowDocumentPrefetch } from '../shared/lib/documents/useFlowDocumentPrefetch';
import { prepareCompanionFlowArticle } from '../shared/platform/companion/reading/companionArticlePreparation';
import { predictCompanionFlowDocument } from '../shared/platform/companion/runtime/companionDailyFlow';

export function useCompanionFlowDocumentPrefetch(snapshot: WorkspaceSnapshot | null, session: DailyFlowSession) {
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  const prepare = useCallback((next: string | null, current: string | null) => {
    prepareCompanionFlowArticle(latestSnapshot.current, next, current);
  }, []);
  return useFlowDocumentPrefetch(snapshot ? session : { ...session, currentNodeId: null }, predictCompanionFlowDocument, prepare);
}
