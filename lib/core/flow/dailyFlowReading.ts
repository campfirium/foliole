import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';

import type { DailyFlowSettings, DailyFlowSnapshot } from './dailyFlowContract.js';
import { flowPlan } from './dailyFlowPlanning.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { calculateReviewStepElapsedMs } from './flowSessionProgress.js';
import { advanceReviewSession, completeReviewSession } from './flowSessionState.js';

export function advanceDailyReading(snapshot: DailyFlowSnapshot, session: DailyFlowSession,
  now: string, mode: ReviewSessionMode,
  settings: DailyFlowSettings): DailyFlowSession {
  const current = session.currentNodeId!;
  const soon = (session.soonNodeIds ?? []).filter(id => id !== current);
  const remaining = session.queueNodeIds.filter(id => id !== current && !soon.includes(id));
  const progress = { readingElapsedMsDelta: calculateReviewStepElapsedMs(session, now),
    readTopicDelta: session.queueNodeIds.includes(current) ? 1 : 0 };
  if (remaining.length) return advanceReviewSession(session, { ...progress, handledAt: now,
    nextNodeId: remaining[0]!, queueNodeIds: remaining, soonNodeIds: soon });
  if (soon.length) return advanceReviewSession(session, { ...progress, handledAt: now,
    nextNodeId: soon[0]!, queueNodeIds: [], soonNodeIds: soon.slice(1) });
  const plan = flowPlan(snapshot, mode, now, settings);
  const tasks = mode === 'review-first' ? plan.fsrsQueueNodeIds : mode === 'reading-only' ? plan.readingQueueNodeIds : plan.queueNodeIds;
  const queue = tasks.filter(id => id !== current);
  if (queue.length) return advanceReviewSession(session, { ...progress, handledAt: now,
    nextNodeId: queue[0]!, queueNodeIds: queue, soonNodeIds: [] });
  const continuation = [...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds].find(id => id !== current) ?? null;
  return completeReviewSession(session, { ...progress, completedAt: now, continueNodeId: continuation });
}
