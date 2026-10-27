import type { DbPort } from '../sync/dbPort.js';

import { dailyFlowCommitSchema, type DailyFlowCommitArgs, type DailyFlowSettings } from './dailyFlowContract.js';
import { flowPlan, fullDayCandidates, prepareFlowSession } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import { readDailyFlow, writeDailyFlow } from './dailyFlowStorage.js';
import { resolveReviewSessionProgress } from './flowSessionProgress.js';
import { advanceReviewSession } from './flowSessionState.js';

export async function commitDailyFlowNavigation(db: DbPort,
  stored: NonNullable<Awaited<ReturnType<typeof readDailyFlow>>>, args: DailyFlowCommitArgs,
  settings: DailyFlowSettings, persistence: DailyFlowPersistence, hash: string) {
  dailyFlowCommitSchema.parse(args);
  const source = stored.session;
  if (source.currentNodeId || source.continueNodeId !== args.expectedContinueNodeId ||
    !(source.reviewedItemCount! > 0) || stored.mode === 'review-first') throw new Error('daily_flow_changed');
  const snapshot = await persistence.snapshot(db);
  const mode = stored.mode as 'recommended' | 'reading-only';
  const reading = flowPlan(snapshot, 'reading-only', args.now, settings).readingQueueNodeIds;
  const target = args.expectedContinueNodeId!;
  const corrected = stored.invalidated
    ? prepareFlowSession(snapshot, { now: args.now, mode }, settings, source) : source;
  // Eligibility correction must not turn a stale continuation into an implicit start.
  const popped = corrected.currentNodeId && !corrected.queueNodeIds.includes(corrected.currentNodeId)
    ? [corrected.currentNodeId] : [];
  const base = { ...corrected, currentNodeId: null, completedAt: source.completedAt ?? null,
    soonNodeIds: [...popped, ...(corrected.soonNodeIds ?? [])] };
  const queue = [target, ...reading.filter(id => id !== target)];
  const session = reading.includes(target) ? advanceReviewSession(base, {
    nextNodeId: target, queueNodeIds: queue,
    totalNodeCount: resolveReviewSessionProgress(source).reviewCompletedCount + queue.length
  }) : { ...base, continueNodeId: null };
  const saved = await writeDailyFlow(db, { dayKey: stored.day_key, mode, settingsKey: JSON.stringify(settings),
    now: args.now, revision: stored.revision + 1, session, previousEntries: stored.entries,
    ...(stored.invalidated ? { candidateIds: fullDayCandidates(snapshot, args.now, settings) } : {}) });
  await db.run('INSERT INTO daily_flow_operations (op_id, input_hash, revision, card_json) VALUES (?, ?, ?, NULL)',
    [args.opId, hash, saved.daily!.revision]);
  const ids = [...new Set([target, saved.currentNodeId].filter((id): id is string => Boolean(id)))];
  return { session: saved, nodes: Object.fromEntries(ids.filter(id => snapshot.nodesById[id])
    .map(id => [id, snapshot.nodesById[id]!])) };
}
