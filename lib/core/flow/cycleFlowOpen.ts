import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import { isFsrsReviewItemNode } from '../review/reviewItemKind.js';

import { cycleChanges } from './cycleFlowChanges.js';
import { cycleWindow, selectCycleSuccessor } from './cycleFlowSelection.js';
import { allocateCycleKey, cycleMeta, sameCycleProgress } from './cycleFlowState.js';
import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowOpenArgs, DailyFlowSettings } from './dailyFlowContract.js';
import { flowDay, flowPlan, fullDayCandidates, prepareDailyFlowPlans, prepareFlowSession } from './dailyFlowPlanning.js';
import { readCurrentFlowLearning } from './dailyFlowReceipt.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { createSqliteDailyFlowStore } from './dailyFlowSqliteStore.js';
import type { DailyFlowStore } from './dailyFlowStore.js';
import type { CycleStored } from './dailyFlowStore.js';

export async function initializeCycle(db: DailyFlowStore, args: DailyFlowOpenArgs, settings: DailyFlowSettings) {
  const snapshot = await db.learningSnapshot();
  const seed = args.seed?.sessionStartedAt && flowDay(args.seed.sessionStartedAt, settings) === flowDay(args.now, settings)
    ? args.seed : undefined;
  const plans = prepareDailyFlowPlans(snapshot, args, settings);
  const initial = prepareFlowSession(snapshot, args, settings, seed, plans.initial);
  const queue = initial.queueNodeIds;
  const queued = new Set(queue);
  const pinned = initial.currentNodeId && !queue.includes(initial.currentNodeId) ? [initial.currentNodeId] : [];
  const soon = [...new Set([...(initial.hiddenSoonNodeIds ?? []), ...(initial.soonNodeIds ?? [])])];
  const ids = [...new Set([...queue, ...pinned, ...soon, ...plans.fullDayNodeIds])];
  const pendingSoon = new Set(soon);
  const rows: CycleRow[] = ids.map((node_id, index) => ({ node_id, order_key: index + 1, active: 1,
    handled: 0, cohort: queued.has(node_id) ? 'queue' : pendingSoon.has(node_id) ? 'soon' : 'none', initial_task: queued.has(node_id) ? 1 : 0 }));
  const cycle = { clearKey: queue.length, clearedAt: null, scanAfter: 0, lapLimit: rows.length, tailKey: rows.length,
    remaining: queue.length,
    reviewRemaining: queue.filter(id => isFsrsReviewItemNode(snapshot.nodesById[id])).length };
  await db.writeRows(rows);
  const current = initial.currentNodeId;
  const session = { ...initial, currentNodeId: current, flowFormat: 'cycle-v1' as const, cycle };
  if (current) cycle.scanAfter = rows.find(row => row.node_id === current)!.order_key;
  else await chooseCycleCurrent(db, session, args.mode, args.now, settings);
  return { session, snapshot, rows };
}

export async function reconcileCycle(db: DailyFlowStore, stored: CycleStored, now: string,
  settings: DailyFlowSettings, captureChanges = false) {
  const snapshot = await db.learningSnapshot();
  const eligible = new Set(fullDayCandidates(snapshot, now, settings));
  const rows = await db.readRows();
  const meta = { ...stored.session.cycle! };
  const changes = cycleChanges(meta);
  const known = new Map(rows.map(row => [row.node_id, row]));
  for (const row of rows) {
    if (row.active && !eligible.has(row.node_id)) changes.set(row, { ...row, active: 0, initial_task: 0 });
    else if (!row.active && eligible.has(row.node_id)) changes.set(row, { ...row, active: 1, initial_task: 0,
      cohort: 'none', order_key: allocateCycleKey(meta) });
  }
  for (const id of eligible) if (!known.has(id)) changes.set(undefined,
    { node_id: id, order_key: allocateCycleKey(meta), active: 1, initial_task: 0, handled: 0, cohort: 'none' });
  await db.writeRows(changes.rows());
  const final = new Map([...rows, ...changes.rows()].map(row => [row.node_id, row]));
  const remaining = [...final.values()].filter(row => row.active && row.initial_task);
  meta.remaining = remaining.length;
  meta.reviewRemaining = remaining.filter(row => isFsrsReviewItemNode(snapshot.nodesById[row.node_id])).length;
  delete meta.change;
  if (captureChanges) meta.change = changes.change();
  return { ...stored.session, cycle: meta };
}

export async function isCycleCurrentReady(db: DailyFlowStore, session: DailyFlowSession, mode: ReviewSessionMode,
  now: string, settings: DailyFlowSettings) {
  const id = session.currentNodeId;
  if (!id) return false;
  const [row] = await db.readRows([id]);
  if (!row?.active) return false;
  const snapshot = await db.scopedLearningSnapshot([id]);
  const plan = flowPlan(snapshot, mode, now, settings);
  return (mode === 'review-first' ? plan.fsrsQueueNodeIds : mode === 'reading-only' ? plan.readingQueueNodeIds
    : [...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds]).includes(id);
}

export async function chooseCycleCurrent(db: DailyFlowStore, session: DailyFlowSession, mode: ReviewSessionMode,
  now: string, settings: DailyFlowSettings) {
  const selected = await selectCycleSuccessor(db, session.cycle!, { mode, now, settings });
  session.currentNodeId = selected?.node_id ?? null;
  session.isAnswerRevealed = false;
  session.currentItemStartedAt = now;
  session.completedAt = selected ? null : session.cycle!.clearedAt;
  session.continueNodeId = null;
  return selected;
}

export async function openStoredDailyFlow(db: DailyFlowStore, args: DailyFlowOpenArgs, settings: DailyFlowSettings, captureChanges = false, createdRows?: (rows: CycleRow[]) => void) {
  let stored = await db.readState();
  const dayKey = flowDay(args.now, settings);
  if (stored && stored.day_key !== dayKey) {
    await db.resetCycle();
    stored = null;
    args = { ...args, seed: undefined, preferredNodeId: undefined };
  }
  if (args.startup && args.mode !== 'recommended') {
    const snapshot = await db.learningSnapshot();
    const plan = flowPlan(snapshot, args.mode, args.now, settings);
    const ready = args.mode === 'review-first' ? plan.fsrsQueueNodeIds : plan.readingQueueNodeIds;
    if (!ready.length) args = { ...args, mode: 'recommended' };
  }
  let session: DailyFlowSession;
  if (!stored) {
    const initial = await initializeCycle(db, args, settings);
    session = initial.session;
    createdRows?.(initial.rows);
  }
  else {
    session = stored.invalidated || stored.settings_key !== JSON.stringify(settings)
      ? await reconcileCycle(db, stored, args.now, settings, captureChanges) : { ...stored.session, cycle: { ...stored.session.cycle! } };
    if (args.preferredNodeId && args.preferredNodeId !== session.currentNodeId) {
      const preferred = { ...session, currentNodeId: args.preferredNodeId };
      if (await isCycleCurrentReady(db, preferred, args.mode, args.now, settings)) {
        const [row] = await db.readRows([args.preferredNodeId]);
        session = { ...preferred, completedAt: null, currentItemStartedAt: args.now, isAnswerRevealed: false,
          cycle: { ...session.cycle!, scanAfter: row!.order_key } };
      }
    }
    if (!await isCycleCurrentReady(db, session, args.mode, args.now, settings)) {
      await chooseCycleCurrent(db, session, args.mode, args.now, settings);
    }
  }
  if (args.prepareOnly && !session.sessionStartedAt) {
    session = { ...session, sessionStartedAt: null, currentItemStartedAt: null, completedAt: null };
  } else if (!args.prepareOnly && session.currentNodeId && !session.sessionStartedAt) {
    session = { ...session, sessionStartedAt: args.now, currentItemStartedAt: args.now };
  }
  session = cycleWindow(session);
  if (captureChanges && session.cycle?.change) {
    session.cycle.change.target = cycleMeta(session.cycle);
  }
  const unchanged = stored && !stored.invalidated && stored.mode === args.mode && stored.settings_key === JSON.stringify(settings)
    && sameCycleProgress(session, stored.session)
    && JSON.stringify(session.queueNodeIds) === JSON.stringify(stored.session.queueNodeIds);
  if (stored && unchanged && !args.refresh && !args.preferredNodeId) return { mode: args.mode, session: stored.session, learning: await readCurrentFlowLearning(db, stored.session.currentNodeId) };
  const saved = await db.saveState({ dayKey, mode: args.mode, settingsKey: JSON.stringify(settings), now: args.now,
    revision: (stored?.revision ?? 0) + 1, session });
  return { mode: args.mode, session: saved, learning: await readCurrentFlowLearning(db, saved.currentNodeId) };
}

export function openCycleFlow(db: import('../sync/dbPort.js').DbPort, args: DailyFlowOpenArgs,
  settings: DailyFlowSettings, persistence: import('./dailyFlowService.js').DailyFlowPersistence, captureChanges = false, createdRows?: (rows: CycleRow[]) => void) {
  return openStoredDailyFlow(createSqliteDailyFlowStore(db, persistence), args, settings, captureChanges, createdRows);
}
