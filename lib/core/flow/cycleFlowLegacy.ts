import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';

import { cycleChanges } from './cycleFlowChanges.js';
import { allocateCycleKey } from './cycleFlowState.js';
import type { DailyFlowSettings } from './dailyFlowContract.js';
import { flowPlan } from './dailyFlowPlanning.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { createSqliteDailyFlowStore } from './dailyFlowSqliteStore.js';
import type { DailyFlowStore } from './dailyFlowStore.js';
import { restoreFlowHistorySessionAsync } from './flowHistorySessionAsync.js';

// This materialization is reserved for an explicitly tagged legacy undo/redo operation.
export async function readStoredLegacyCycleProjection(db: DailyFlowStore, settings: DailyFlowSettings, now: string): Promise<DailyFlowSession> {
  const stored = await db.readState();
  if (!stored) throw new Error('daily_flow_changed');
  const rows = (await db.readRows()).filter(row => row.active);
  const snapshot = await db.learningSnapshot();
  const plan = flowPlan(snapshot, stored.mode as ReviewSessionMode, now, settings);
  const all = new Set([...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds]);
  const allowed = new Set(stored.mode === 'review-first' ? plan.fsrsQueueNodeIds : stored.mode === 'reading-only'
    ? plan.readingQueueNodeIds : [...all]);
  const current = stored.session.currentNodeId;
  const soon = rows.filter(row => row.cohort === 'soon' && row.node_id !== current && all.has(row.node_id));
  const session = { ...stored.session };
  delete session.cycle;
  delete session.flowFormat;
  return { ...session, flowFormat: 'legacy-queue-v1',
    queueNodeIds: rows.filter(row => row.cohort === 'queue' && allowed.has(row.node_id)).map(row => row.node_id),
    soonNodeIds: soon.filter(row => allowed.has(row.node_id)).map(row => row.node_id),
    hiddenSoonNodeIds: soon.filter(row => !allowed.has(row.node_id)).map(row => row.node_id) };
}

export function sameLegacySession(left: DailyFlowSession, right: DailyFlowSession, grade = false) {
  const normalized = (session: DailyFlowSession) => Object.entries({ ...session, queueNodeIds: session.queueNodeIds ?? [],
    soonNodeIds: session.soonNodeIds ?? [], hiddenSoonNodeIds: session.hiddenSoonNodeIds ?? [],
    ...(grade ? { nextReviewDueAt: null } : {}) }).filter(([key, value]) =>
    !['daily', 'cycle', 'flowFormat', 'queueHistory', 'isAnswerRevealed'].includes(key) && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(normalized(left)) === JSON.stringify(normalized(right));
}

export async function replayLegacyCycle(db: DailyFlowStore, source: DailyFlowSession,
  args: import('./dailyFlowContract.js').DailyFlowCommitArgs, settings: DailyFlowSettings) {
  const projection = await readStoredLegacyCycleProjection(db, settings, args.now);
  if (!args.historySourceSession || !args.nextSession) throw new Error('flow_history_unavailable');
  const expected = await restoreFlowHistorySessionAsync(args.historySourceSession, projection);
  const target = await restoreFlowHistorySessionAsync(args.nextSession, projection);
  if (!sameLegacySession(projection, expected, Boolean(args.reviewHistory))) throw new Error('flow_history_changed');
  return installLegacyCycleTarget(db, source, projection, target, args.now);
}

export async function installLegacyCycleTarget(db: DailyFlowStore, source: DailyFlowSession, projection: DailyFlowSession,
  target: DailyFlowSession, now: string) {
  if (!source.cycle) throw new Error('daily_flow_cycle_missing');
  const meta = { ...source.cycle };
  delete meta.change;
  const original = await db.readRows();
  const rows = new Map(original.map(row => [row.node_id, row]));
  const projected = new Set([...projection.queueNodeIds, ...(projection.soonNodeIds ?? []),
    ...(projection.hiddenSoonNodeIds ?? []), projection.currentNodeId].filter(Boolean));
  const targetQueue = target.queueNodeIds;
  const current = target.currentNodeId;
  const pending = [...new Set([...(target.hiddenSoonNodeIds ?? []), ...(target.soonNodeIds ?? [])])];
  const pinned = current && !targetQueue.includes(current) ? [current] : [];
  const complement = original.filter(row => row.active && !projected.has(row.node_id)).map(row => row.node_id);
  const ids = [...new Set([...targetQueue, ...pinned, ...pending, ...complement])];
  const wanted = new Set(ids);
  const changes = cycleChanges(meta);
  for (const row of original) if (projected.has(row.node_id) && !wanted.has(row.node_id)) {
    changes.set(row, { ...row, active: 0, initial_task: 0 });
  }
  for (const id of ids) {
    const row = rows.get(id);
    changes.set(row, { node_id: id, order_key: allocateCycleKey(meta), active: 1,
      handled: targetQueue.includes(id) ? 0 : row?.handled ?? 1, cohort: targetQueue.includes(id) ? 'queue' : pending.includes(id) ? 'soon' : row?.cohort ?? 'none',
      initial_task: targetQueue.includes(id) ? 1 : complement.includes(id) ? row?.initial_task ?? 0 : 0 });
  }
  await db.writeRows(changes.rows());
  const saved = new Map([...original, ...changes.rows()].map(row => [row.node_id, row]));
  meta.clearKey = targetQueue.length ? saved.get(targetQueue.at(-1)!)!.order_key : 0;
  meta.clearedAt = targetQueue.length ? null : source.cycle.clearedAt ?? target.completedAt ?? now;
  meta.scanAfter = current ? saved.get(current)!.order_key : 0;
  meta.lapLimit = meta.tailKey;
  meta.remaining = [...saved.values()].filter(row => row.active && row.initial_task).length;
  // The ordinary open/commit eligibility refresh supplies authoritative kind counts.
  meta.reviewRemaining = Math.min(meta.reviewRemaining, meta.remaining);
  return { ...target, flowFormat: 'cycle-v1' as const, cycle: meta };
}

export function readLegacyCycleProjection(db: import('../sync/dbPort.js').DbPort, settings: DailyFlowSettings,
  persistence: import('./dailyFlowService.js').DailyFlowPersistence, now: string) {
  return readStoredLegacyCycleProjection(createSqliteDailyFlowStore(db, persistence), settings, now);
}
