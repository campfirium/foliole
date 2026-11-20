import { useCallback, useRef } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { DailyFlowPredictionArgs } from '../../lib/core/flow/dailyFlowPrediction';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { useFlowDocumentPrefetch } from '../shared/lib/documents/useFlowDocumentPrefetch';
import { prepareCompanionFlowArticle } from '../shared/platform/companion/reading/companionArticlePreparation';
import { timeCompanionActivity } from '../shared/platform/companion/runtime/companionActivityTiming';
import { predictCompanionFlowDocument } from '../shared/platform/companion/runtime/companionDailyFlow';
import type { CompanionReadIntents } from '../shared/platform/companion/runtime/companionReadIntents';
import { noteAndroidFlowPrediction } from '../shared/platform/supportLog/androidFlowTiming';

export function useCompanionFlowDocumentPrefetch(snapshot: WorkspaceSnapshot | null, session: DailyFlowSession,
  engine: CompanionReadIntents | undefined, mode: ReviewSessionMode) {
  const latestSnapshot = useRef(snapshot);
  latestSnapshot.current = snapshot;
  const prepare = useCallback((next: string | null, current: string | null) => {
    prepareCompanionFlowArticle(latestSnapshot.current, next, current);
  }, []);
  const predict = useCallback(async (args: DailyFlowPredictionArgs, signal: AbortSignal) => {
    if (!snapshot?.nodesById || signal.aborted) return null;
    const next = await timeCompanionActivity('predict-next', async () => {
      if (!engine) return predictCompanionFlowDocument(args, signal);
      const result = await engine.displayPreparation.prepare({ session, mode, now: args.now }, signal);
      return signal.aborted ? null : result.session.currentNodeId;
    });
    if (!signal.aborted) noteAndroidFlowPrediction(args.currentNodeId, next);
    return next;
  }, [snapshot?.nodesById, session, engine, mode]);
  return useFlowDocumentPrefetch(snapshot && !session.dive ? session : { ...session, currentNodeId: null }, predict, prepare);
}
