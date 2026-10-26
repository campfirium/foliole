import type { DailyFlowCommitArgs } from '../../lib/core/flow/dailyFlowContract';
import { dailyFlowHistoryCommand } from '../../lib/core/flow/dailyFlowHistory';
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
    nextSession: withoutDailyToken(nextSession), readings: changes,
    ...(entry.title === 'Read Topic' ? { readingAction: 'read' as const }
      : entry.title === 'Later Topic' ? { readingAction: 'later' as const }
      : entry.title === 'Dismiss Topic' ? { readingAction: 'dismiss' as const } : {}) });
}

export function saveDailyGrade(session: ReviewSessionState, entry: WorkspaceReviewGradeHistoryEntry,
  value: Omit<NonNullable<DailyFlowCommitArgs['grade']>, 'before'>) {
  return commitDailyFlowRuntime({ opId: entry.id, now: value.reviewedAt, token: session.daily!, sourceSession: session,
    grade: { ...value, before: entry.beforeReview } });
}

export function saveDailyHistory(args: { session: ReviewSessionState; entry: WorkspaceTopicDismissHistoryEntry |
  WorkspaceReviewGradeHistoryEntry; mode: 'undo' | 'redo'; now: string; nodes?: Node[] }) {
  return commitDailyFlowRuntime(dailyFlowHistoryCommand(args));
}
