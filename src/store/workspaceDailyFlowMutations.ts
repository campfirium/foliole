import type { DailyFlowCommitArgs } from '../../lib/core/flow/dailyFlowContract';
import { withoutDailyToken } from '../../lib/core/flow/dailyFlowService';
import type { Node } from '../features/nodes/model/nodeTypes';
import { commitDailyFlowRuntime, hasDailyFlowRuntime } from '../shared/platform/runtime/dailyFlowRuntimeRepository';

import type { WorkspaceReviewGradeHistoryEntry } from './workspaceReviewGradeActionHistory';
import type { ReviewSessionState } from './workspaceStoreTypes';
import type { WorkspaceTopicDismissHistoryEntry } from './workspaceTopicDismissActionHistory';

export function hasPersistentDailyFlow(session: ReviewSessionState) {
  return Boolean(session.daily && hasDailyFlowRuntime());
}

export function saveDailyReading(session: ReviewSessionState, entry: WorkspaceTopicDismissHistoryEntry,
  now: string, nextSession: ReviewSessionState, completedReviewDay?: string) {
  const changes = [{ nodeId: entry.nodeId, before: entry.beforeReading ?? null, after: entry.afterReading ?? null,
    ...(completedReviewDay === undefined ? {} : { completedReviewDay }) },
  ...(entry.relatedReadings ?? []).map(value => ({ nodeId: value.nodeId,
    before: value.beforeReading ?? null, after: value.afterReading ?? null }))];
  return commitDailyFlowRuntime({ opId: entry.id, now, token: session.daily!, sourceSession: session,
    nextSession: withoutDailyToken(nextSession), readings: changes });
}

export function saveDailyGrade(session: ReviewSessionState, entry: WorkspaceReviewGradeHistoryEntry,
  value: Omit<NonNullable<DailyFlowCommitArgs['grade']>, 'before'>) {
  return commitDailyFlowRuntime({ opId: entry.id, now: value.reviewedAt, token: session.daily!, sourceSession: session,
    grade: { ...value, before: entry.beforeReview } });
}

export function saveDailyHistory(args: { session: ReviewSessionState; entry: WorkspaceTopicDismissHistoryEntry |
  WorkspaceReviewGradeHistoryEntry; mode: 'undo' | 'redo'; now: string; nodes?: Node[] }) {
  const entry = args.entry;
  const undo = args.mode === 'undo';
  const context = undo ? entry.beforeContext : entry.afterContext;
  const common = { opId: `${entry.id}:${args.mode}:${args.now}`, now: args.now, token: args.session.daily!, sourceSession: args.session,
    nextSession: withoutDailyToken(context.reviewSession) };
  if (entry.type === 'review.grade') return commitDailyFlowRuntime({ ...common,
    reviewHistory: { nodeId: entry.nodeId, before: undo ? entry.afterReview : entry.beforeReview,
      after: undo ? entry.beforeReview : entry.afterReview, mode: args.mode, targetOpId: entry.reviewOpId ?? entry.id } });
  const before = [{ nodeId: entry.nodeId, beforeReading: entry.beforeReading, afterReading: entry.afterReading },
    ...(entry.relatedReadings ?? [])];
  return commitDailyFlowRuntime({ ...common, readings: before.map(value => ({ nodeId: value.nodeId,
    before: (undo ? value.afterReading : value.beforeReading) ?? null,
    after: (undo ? value.beforeReading : value.afterReading) ?? null })) });
}
