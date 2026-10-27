import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowCommitArgs, DailyFlowSettings } from './dailyFlowContract.js';
import { hasReadyDailyReview } from './dailyFlowGrade.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { readDailyFlow } from './dailyFlowStorage.js';
import { calculateReviewStepElapsedMs } from './flowSessionProgress.js';
import { advanceReviewSession } from './flowSessionState.js';

export async function dailySoonScope(db: DbPort, stored: NonNullable<Awaited<ReturnType<typeof readDailyFlow>>>,
  args: DailyFlowCommitArgs, settings: DailyFlowSettings, persistence: DailyFlowPersistence) {
  const soon = args.readingAction === 'soon';
  if ((!soon && !args.nextSession) || args.grade || args.reviewHistory || (args.readingAction && !soon) || args.historyMode ||
    stored.invalidated || stored.settings_key !== JSON.stringify(settings) ||
    (args.readings ?? []).some(value => JSON.stringify(value.before) !== JSON.stringify(value.after))) return null;
  if (stored.mode !== 'reading-only' && await hasReadyDailyReview(db, args.now, settings, persistence)) return null;
  const next = soon ? stored.session.queueNodeIds.find(id => id !== stored.session.currentNodeId)
    ?? stored.session.soonNodeIds?.[0] ?? stored.session.currentNodeId : args.nextSession?.currentNodeId;
  return [...new Set([stored.session.currentNodeId, next,
    ...(args.readings ?? []).map(value => value.nodeId)].filter((id): id is string => Boolean(id)))];
}

export function advanceDailySoon(session: DailyFlowSession, now: string) {
  const current = session.currentNodeId!;
  const queue = session.queueNodeIds.filter(id => id !== current);
  const soon = [...(session.soonNodeIds ?? []).filter(id => id !== current), current];
  const next = queue[0] ?? soon.shift()!;
  return advanceReviewSession(session, { handledAt: now, nextNodeId: next, queueNodeIds: queue,
    soonNodeIds: soon, readingElapsedMsDelta: calculateReviewStepElapsedMs(session, now),
    readTopicDelta: session.queueNodeIds.includes(current) ? 1 : 0 });
}
