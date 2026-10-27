import type { DailyFlowSession } from './dailyFlowSession.js';
import { calculateReviewStepElapsedMs } from './flowSessionProgress.js';
import { advanceReviewSession } from './flowSessionState.js';

export function advanceDailySoon(session: DailyFlowSession, now: string) {
  const current = session.currentNodeId!;
  const queue = session.queueNodeIds.filter(id => id !== current);
  const soon = [...(session.soonNodeIds ?? []).filter(id => id !== current), current];
  const next = queue[0] ?? soon.shift()!;
  return advanceReviewSession(session, { handledAt: now, nextNodeId: next, queueNodeIds: queue,
    soonNodeIds: soon, readingElapsedMsDelta: calculateReviewStepElapsedMs(session, now),
    readTopicDelta: session.queueNodeIds.includes(current) ? 1 : 0 });
}
