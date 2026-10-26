import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowCommitArgs, DailyFlowSettings, DailyFlowSnapshot } from './dailyFlowContract.js';
import { hasReadyDailyReview } from './dailyFlowGrade.js';
import { flowPlan } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { readDailyFlow } from './dailyFlowStorage.js';
import { calculateReviewStepElapsedMs } from './flowSessionProgress.js';
import { advanceReviewSession, completeReviewSession } from './flowSessionState.js';

export async function dailyReadingScope(db: DbPort, stored: NonNullable<Awaited<ReturnType<typeof readDailyFlow>>>,
  args: DailyFlowCommitArgs, settings: DailyFlowSettings, persistence: DailyFlowPersistence) {
  if (!args.readingAction || stored.invalidated || stored.settings_key !== JSON.stringify(settings)) return null;
  if (stored.mode !== 'reading-only' && await hasReadyDailyReview(db, args.now, settings, persistence)) return null;
  const affected = (args.readings ?? []).map(value => value.nodeId);
  const next = stored.session.queueNodeIds.find(id => id !== stored.session.currentNodeId)
    ?? stored.session.soonNodeIds?.[0];
  if (next) return [...affected, next];
  const candidates = await db.query<{ node_id: string }>(`SELECT e.node_id FROM daily_flow_entries e
    JOIN nodes n ON n.id = e.node_id WHERE n.kind = 'topic' ORDER BY e.initial_position`);
  return [...new Set([...affected, ...candidates.map(row => row.node_id)])];
}

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
