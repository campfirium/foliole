import type { DailyFlowCommitArgs } from './dailyFlowContract.js';
import { dailyFlowOperationId } from './dailyFlowRetry.js';
import type { DailyFlowSession } from './dailyFlowSession.js';

type Reading = NonNullable<DailyFlowCommitArgs['readings']>[number]['before'];
type Review = NonNullable<DailyFlowCommitArgs['reviewHistory']>['before'];
type Context = { reviewSession: DailyFlowSession };
type Common = { id: string; nodeId: string; beforeContext: Context; afterContext: Context };
type Entry = Common & ({ type: 'review.grade'; reviewOpId?: string; beforeReview: Review; afterReview: Review } |
  { type: 'topic.dismiss'; beforeReading: Reading; afterReading: Reading;
    relatedReadings?: { nodeId: string; beforeReading: Reading; afterReading: Reading }[] });

export function dailyFlowHistoryCommand(args: { session: DailyFlowSession; entry: Entry;
  mode: 'undo' | 'redo'; now: string }): DailyFlowCommitArgs {
  const { entry, session, mode, now } = args;
  if (!session.daily) throw new Error('daily_flow_token_missing');
  const undo = mode === 'undo';
  const common = { opId: dailyFlowOperationId(session.daily, entry.id, mode), now, token: session.daily, historyMode: mode,
    sourceSession: session, nextSession: (undo ? entry.beforeContext : entry.afterContext).reviewSession };
  if (entry.type === 'review.grade') return { ...common, reviewHistory: { nodeId: entry.nodeId,
    before: undo ? entry.afterReview : entry.beforeReview, after: undo ? entry.beforeReview : entry.afterReview,
    mode, targetOpId: entry.reviewOpId ?? entry.id } };
  return { ...common, readings: [entry, ...(entry.relatedReadings ?? [])]
    .map(value => ({ nodeId: value.nodeId, before: undo ? value.afterReading : value.beforeReading,
      after: undo ? value.beforeReading : value.afterReading })) };
}
