import { flowDay } from '../../lib/core/flow/dailyFlowPlanning';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import type { Node } from '../features/nodes/model/nodeTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { isSameNodeReading, isSameNodeReview } from './workspaceNodeLearningComparison';

export function hasFlowDayChanged(session: DailyFlowSession, now: string) {
  return Boolean(session.daily && session.daily.dayKey !== flowDay(now, {
    ...getCurrentReviewSchedulerSettings(), scope: session.daily.scope, ...(session.dayWindow ? { dayWindow: session.dayWindow } : {})
  }));
}

export function isSameFlowActionTarget(before: Pick<Node, 'id' | 'kind' | 'reveal' | 'review' | 'reading' | 'learningSummary'> | undefined,
  after: Pick<Node, 'id' | 'kind' | 'reveal' | 'review' | 'reading' | 'learningSummary'> | undefined) {
  return Boolean(before && after && before.id === after.id && before.kind === after.kind &&
    before.reveal === after.reveal && isSameNodeReview(before, after) &&
    isSameNodeReading(before, after));
}
