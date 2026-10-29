import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowSettings, DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import { flowPlan } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { buildReviewSessionAfterGrade } from './flowGradeSession.js';
import { calculateReviewStepElapsedMs } from './flowSessionProgress.js';
import { advanceReviewSession } from './flowSessionState.js';


export async function scopedDailySnapshot(db: DbPort, persistence: DailyFlowPersistence,
  ids: (string | null | undefined)[]) {
  return persistence.snapshot(db, await dailyFactNodeIds(db, ids));
}

export async function scopedDailyLearningSnapshot(db: DbPort, persistence: DailyFlowPersistence,
  ids: (string | null | undefined)[]) {
  return persistence.learningSnapshot(db, await dailyFactNodeIds(db, ids));
}

/** Reuse ancestor identities only within the caller-owned store/transaction. */
export function createScopedDailyLearningReader(db: DbPort, persistence: DailyFlowPersistence) {
  const scopes = new Map<string, Promise<string[]>>();
  return async (input: readonly (string | null | undefined)[]) => {
    const ids = [...new Set(input.filter((id): id is string => Boolean(id)))].sort();
    const key = JSON.stringify(ids);
    let scope = scopes.get(key);
    if (!scope) {
      scope = dailyFactNodeIds(db, ids);
      scopes.set(key, scope);
    }
    const selected = await scope;
    if (scopes.size > 128) scopes.clear();
    return persistence.learningSnapshot(db, selected);
  };
}

async function dailyFactNodeIds(db: DbPort, ids: (string | null | undefined)[]) {
  const ancestors = await db.query<{ id: string }>(`WITH RECURSIVE selected(id, parent_id) AS (
    SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
    UNION SELECT n.id, n.parent_id FROM nodes n JOIN selected s ON n.id = s.parent_id
  ) SELECT id FROM selected`, [JSON.stringify(ids.filter(Boolean))]);
  return ancestors.map(row => row.id);
}

export function advanceDailyGrade(snapshot: DailyFlowLearningSnapshot, session: DailyFlowSession,
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
