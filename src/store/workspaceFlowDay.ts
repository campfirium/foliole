import { flowDay } from '../../lib/core/flow/dailyFlowPlanning';
import type { DailyFlowSession } from '../../lib/core/flow/dailyFlowSession';
import type { Node } from '../features/nodes/model/nodeTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

export function hasFlowDayChanged(session: DailyFlowSession, now: string) {
  return Boolean(session.daily && session.daily.dayKey !== flowDay(now, {
    ...getCurrentReviewSchedulerSettings(), scope: session.daily.scope
  }));
}

export function isSameFlowActionTarget(before: Pick<Node, 'id' | 'kind' | 'reveal' | 'review' | 'reading'> | undefined,
  after: Pick<Node, 'id' | 'kind' | 'reveal' | 'review' | 'reading'> | undefined) {
  return Boolean(before && after && before.id === after.id && before.kind === after.kind &&
    before.reveal === after.reveal && JSON.stringify(before.review ?? null) === JSON.stringify(after.review ?? null) &&
    JSON.stringify(before.reading ?? null) === JSON.stringify(after.reading ?? null));
}
