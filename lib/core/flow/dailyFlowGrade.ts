import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowCommitArgs, DailyFlowSettings, DailyFlowSnapshot } from './dailyFlowContract.js';
import { flowPlan } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { readDailyFlow } from './dailyFlowStorage.js';
import { buildReviewSessionAfterGrade } from './flowGradeSession.js';
import { calculateReviewStepElapsedMs } from './flowSessionProgress.js';
import { advanceReviewSession } from './flowSessionState.js';

type StoredFlow = NonNullable<Awaited<ReturnType<typeof readDailyFlow>>>;

export async function scopedDailySnapshot(db: DbPort, persistence: DailyFlowPersistence,
  ids: (string | null | undefined)[]) {
  const ancestors = await db.query<{ id: string }>(`WITH RECURSIVE selected(id, parent_id) AS (
    SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
    UNION SELECT n.id, n.parent_id FROM nodes n JOIN selected s ON n.id = s.parent_id
  ) SELECT id FROM selected`, [JSON.stringify(ids.filter(Boolean))]);
  return persistence.snapshot(db, ancestors.map(row => row.id));
}

export async function dailyGradeScope(db: DbPort, stored: StoredFlow, args: DailyFlowCommitArgs,
  settings: DailyFlowSettings) {
  if (!args.grade || stored.invalidated || stored.settings_key !== JSON.stringify(settings)) return null;
  const next = stored.session.queueNodeIds.find(id => id !== args.grade!.nodeId);
  // A newly due minute item is a time-driven eligibility change, rather than an ordinary grade.
  const ready = await db.query(`SELECT e.node_id FROM daily_flow_entries e JOIN node_review r ON r.node_id = e.node_id
    WHERE e.queue_position IS NULL AND r.scheduled_days < 1 AND julianday(r.due) <= julianday(?) LIMIT 1`, [args.now]);
  if (ready.length) return null;
  const successor = next ?? stored.session.soonNodeIds?.[0];
  if (successor) return [args.grade.nodeId, successor];
  // At Queue Clear, only the saved daily reading candidates can form the continuation.
  const readings = await db.query<{ node_id: string }>(`SELECT e.node_id FROM daily_flow_entries e
    JOIN nodes n ON n.id = e.node_id WHERE n.kind = 'topic' ORDER BY e.initial_position`);
  return [args.grade.nodeId, ...readings.map(row => row.node_id)];
}

export function advanceDailyGrade(snapshot: DailyFlowSnapshot, session: DailyFlowSession,
  now: string, settings: DailyFlowSettings): DailyFlowSession {
  const nodeId = session.currentNodeId!;
  const stillReady = flowPlan(snapshot, 'review-first', now, settings).fsrsQueueNodeIds.includes(nodeId);
  const queue = session.queueNodeIds.filter(id => id !== nodeId || stillReady);
  const soon = session.soonNodeIds ?? [];
  const progress = { nextReviewDueAt: snapshot.nodesById[nodeId]?.review?.due ?? null,
    reviewElapsedMsDelta: calculateReviewStepElapsedMs(session, now), reviewedItemDelta: stillReady ? 0 : 1 };
  if (!queue.length && soon.length) return advanceReviewSession(session, { ...progress,
    handledAt: now, nextNodeId: soon[0]!, queueNodeIds: [], soonNodeIds: soon.slice(1) });
  return buildReviewSessionAfterGrade({ ...progress, nextDueAt: progress.nextReviewDueAt,
    continueNodeId: queue.length ? null : flowPlan(snapshot, 'reading-only', now, settings).readingQueueNodeIds[0] ?? null,
    nextNodeId: queue[0] ?? null, queueNodeIds: queue, now, reviewSession: session });
}
