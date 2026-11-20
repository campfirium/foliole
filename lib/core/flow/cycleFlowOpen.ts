import { hasNodeContent } from '../nodes/nodeContentFlags.js';
import { hasDeletedAncestor, hasShelvedAncestor } from '../review/queue/reviewQueuePlannerHelpers.js';
import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import { isFsrsReviewItemNode, isReadingReviewItemNode } from '../review/reviewItemKind.js';

import { buildCycle } from './cycleFlowBuild.js';
import { cycleChanges } from './cycleFlowChanges.js';
import { deriveCycleReadiness, withCycleReadiness } from './cycleFlowReadiness.js';
import { cycleWindow, selectCycleSuccessor } from './cycleFlowSelection.js';
import { allocateCycleKey, cycleMeta, sameCycleProgress } from './cycleFlowState.js';
import type { CycleRow, CycleStoredRow } from './cycleFlowTypes.js';
import type { DailyFlowLearningSnapshot, DailyFlowOpenArgs, DailyFlowSettings } from './dailyFlowContract.js';
import { flowDay, flowPlan, fullDayCandidates } from './dailyFlowPlanning.js';
import { readCurrentFlowLearning } from './dailyFlowReceipt.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { createSqliteDailyFlowStore } from './dailyFlowSqliteStore.js';
import type { DailyFlowStore } from './dailyFlowStore.js';
import type { CycleStored } from './dailyFlowStore.js';
import { timeFlow, timeFlowScan, type FlowTiming } from './flowTiming.js';

export async function initializeCycle(db: DailyFlowStore, args: DailyFlowOpenArgs, settings: DailyFlowSettings) {
  const snapshot = await db.learningSnapshot();
  const { session, rows, mode } = buildCycle(snapshot, args, settings);
  const cycle = session.cycle!;
  db.timing?.('queue-size', 'done', rows.length);
  await db.writeRows(withCycleReadiness(rows, deriveCycleReadiness(snapshot, rows.map(row => row.node_id), args.now, settings)));
  const current = session.currentNodeId;
  if (current) cycle.scanAfter = rows.find(row => row.node_id === current)!.order_key;
  else await chooseCycleCurrent(db, session, mode, args.now, settings);
  return { session, snapshot, rows, mode };
}

export async function reconcileCycle(db: Pick<DailyFlowStore, 'learningSnapshot' | 'readRows' | 'writeRows' | 'readReadiness'>, stored: CycleStored, now: string,
  settings: DailyFlowSettings, captureChanges = false) {
  const snapshot = await db.learningSnapshot();
  const eligible = new Set(fullDayCandidates(snapshot, now, settings));
  const rows = await db.readRows();
  const meta = { ...stored.session.cycle! };
  const changes = cycleChanges(meta);
  for (const row of rows) {
    if (row.active && !eligible.has(row.node_id)) changes.set(row, { ...row, active: 0, initial_task: 0 });
    else if (!row.active && eligible.has(row.node_id)) changes.set(row, { ...row, active: 1, initial_task: 0,
      cohort: 'none', order_key: allocateCycleKey(meta) });
  }
  const final = new Map([...rows, ...changes.rows()].map(row => [row.node_id, row]));
  await writeReconciledReadiness(db, [...final.values()].filter(row => row.active), changes.rows(), snapshot, now, settings);
  const remaining = [...final.values()].filter(row => row.active && row.initial_task);
  meta.remaining = remaining.length;
  meta.reviewRemaining = remaining.filter(row => isFsrsReviewItemNode(snapshot.nodesById[row.node_id])).length;
  delete meta.change;
  if (captureChanges) meta.change = changes.change();
  return { ...stored.session, cycle: meta };
}

async function writeReconciledReadiness(db: Pick<DailyFlowStore, 'writeRows' | 'readReadiness'>, active: CycleRow[],
  changed: CycleRow[], snapshot: DailyFlowLearningSnapshot, now: string, settings: DailyFlowSettings) {
  const derived = deriveCycleReadiness(snapshot, active.map(row => row.node_id), now, settings);
  await db.writeRows(withCycleReadiness(changed, derived));
  if (!db.readReadiness) return;
  const touched = new Set(changed.map(row => row.node_id));
  const stored = new Map((await db.readReadiness()).map(row => [row.node_id, row]));
  const stale = active.filter(row => {
    const before = stored.get(row.node_id);
    const after = derived.get(row.node_id);
    return !touched.has(row.node_id) && after && (before?.kind !== after.kind || (before?.ready_at_ms ?? null) !== after.ready_at_ms);
  });
  await db.writeRows(withCycleReadiness(stale, derived));
}

export async function isCycleCurrentReady(db: Pick<DailyFlowStore, 'readRows' | 'scopedLearningSnapshot'>, session: DailyFlowSession, mode: ReviewSessionMode,
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

async function canKeepDisplayedCurrent(db: DailyFlowStore, session: DailyFlowSession) {
  const id = session.currentNodeId;
  if (!id) return false;
  const snapshot = await db.scopedLearningSnapshot([id]);
  const node = snapshot.nodesById[id];
  return Boolean(node && !snapshot.trashedNodeIds.includes(id) && !hasDeletedAncestor(node, snapshot.nodesById) && !hasShelvedAncestor(node, snapshot.nodesById));
}

export async function chooseCycleCurrent(db: Pick<DailyFlowStore, 'scanRows' | 'timedRows' | 'scopedLearningSnapshot' | 'writeRows' | 'timing'>, session: DailyFlowSession, mode: ReviewSessionMode,
  now: string, settings: DailyFlowSettings, changes?: ReturnType<typeof cycleChanges>) {
  const skipped = new Map<string, CycleRow>();
  const healed = new Map<string, CycleStoredRow>();
  const meta = session.cycle!;
  const selected = await timeFlowScan(db.timing, db, scan => selectCycleSuccessor(scan, meta, { mode, now, settings,
    onSkipped: (row, snapshot) => {
      const node = snapshot.nodesById[row.node_id];
      const unavailable = !node || snapshot.trashedNodeIds.includes(row.node_id) || hasDeletedAncestor(node, snapshot.nodesById)
        || (isReadingReviewItemNode(node) && (!hasNodeContent(node) || hasShelvedAncestor(node, snapshot.nodesById)));
      if (!unavailable || !row.initial_task || skipped.has(row.node_id)) return;
      const next = { ...row, initial_task: 0 as const };
      skipped.set(row.node_id, next);
      changes?.set(row, next);
      meta.remaining = Math.max(0, meta.remaining - 1);
      meta.reviewRemaining = Math.min(meta.remaining, Math.max(0,
        meta.reviewRemaining - (isFsrsReviewItemNode(node) ? 1 : 0)));
    }, onReadiness: rows => rows.forEach(row => healed.set(row.node_id, row)) }));
  const writes = new Map<string, CycleStoredRow>(healed);
  for (const [id, row] of skipped) writes.set(id, { ...healed.get(id), ...row });
  await db.writeRows([...writes.values()]);
  session.currentNodeId = selected?.node_id ?? null;
  session.isAnswerRevealed = false;
  session.currentItemStartedAt = now;
  session.completedAt = selected ? null : session.cycle!.clearedAt;
  session.continueNodeId = null;
  return selected;
}

async function resumeStoredCycle(db: DailyFlowStore, session: DailyFlowSession, args: DailyFlowOpenArgs,
  settings: DailyFlowSettings, invalidated: boolean, changes?: ReturnType<typeof cycleChanges>) {
  if (args.preferredNodeId && args.preferredNodeId !== session.currentNodeId) {
    const preferred = { ...session, currentNodeId: args.preferredNodeId };
    if (await isCycleCurrentReady(db, preferred, args.mode, args.now, settings)) {
      const [row] = await db.readRows([args.preferredNodeId]);
      session = { ...preferred, completedAt: null, currentItemStartedAt: args.now, isAnswerRevealed: false,
        cycle: { ...session.cycle!, scanAfter: row!.order_key } };
    }
  }
  const keepCurrent = args.preserveCurrent && await canKeepDisplayedCurrent(db, session);
  const displaced = args.returnFromDive && session.currentNodeId &&
    (await db.readRows([session.currentNodeId]))[0]?.order_key !== session.cycle!.scanAfter;
  if (displaced || (!keepCurrent && !await isCycleCurrentReady(db, session, args.mode, args.now, settings))) {
    await chooseCycleCurrent(db, session, args.mode, args.now, settings, changes);
  } else if (invalidated && session.currentNodeId) {
    const [current] = await db.readRows([session.currentNodeId]);
    if (current) session.cycle!.scanAfter = current.order_key;
  }
  return session;
}

export async function openStoredDailyFlow(db: DailyFlowStore, args: DailyFlowOpenArgs, settings: DailyFlowSettings, captureChanges = false, createdRows?: (rows: CycleRow[]) => void) {
  let stored = await db.readState();
  const dayKey = flowDay(args.now, settings);
  if (stored && stored.day_key !== dayKey) {
    await timeFlow(db.timing, 'day-reset', () => db.resetCycle());
    stored = null;
    args = { ...args, seed: undefined, preferredNodeId: undefined };
  }
  if (stored && args.startup && args.mode !== 'recommended') {
    const snapshot = await db.learningSnapshot();
    const plan = flowPlan(snapshot, args.mode, args.now, settings);
    const ready = args.mode === 'review-first' ? plan.fsrsQueueNodeIds : plan.readingQueueNodeIds;
    if (!ready.length) args = { ...args, mode: 'recommended' };
  }
  let session: DailyFlowSession;
  if (!stored) {
    const initial = await timeFlow(db.timing, 'queue-build', () => initializeCycle(db, args, settings));
    session = initial.session;
    args = { ...args, mode: initial.mode };
    createdRows?.(initial.rows);
  }
  else {
    const reconcile = stored.invalidated || stored.settings_key !== JSON.stringify(settings);
    const changes = captureChanges && !reconcile ? cycleChanges(stored.session.cycle!) : undefined;
    session = reconcile
      ? await timeFlow(db.timing, 'queue-reconcile', () => reconcileCycle(db, stored!, args.now, settings, captureChanges)) : { ...stored.session, cycle: { ...stored.session.cycle! } };
    session = await resumeStoredCycle(db, session, args, settings, Boolean(stored.invalidated), changes);
    if (changes) session.cycle!.change = changes.change();
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
  if (stored && unchanged && !captureChanges && !args.refresh && !args.preferredNodeId) return { mode: args.mode, session: stored.session, learning: await readCurrentFlowLearning(db, stored.session.currentNodeId) };
  const saved = await db.saveState({ dayKey, mode: args.mode, settingsKey: JSON.stringify(settings), now: args.now,
    revision: (stored?.revision ?? 0) + 1, session });
  return { mode: args.mode, session: saved, learning: await readCurrentFlowLearning(db, saved.currentNodeId) };
}

export function openCycleFlow(db: import('../sync/dbPort.js').DbPort, args: DailyFlowOpenArgs,
  settings: DailyFlowSettings, persistence: import('./dailyFlowService.js').DailyFlowPersistence, captureChanges = false, createdRows?: (rows: CycleRow[]) => void, timing?: FlowTiming) {
  const store = createSqliteDailyFlowStore(db, persistence);
  if (timing) store.timing = timing;
  return openStoredDailyFlow(store, args, settings, captureChanges, createdRows);
}
