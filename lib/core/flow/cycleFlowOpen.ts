import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import { isFsrsReviewItemNode } from '../review/reviewItemKind.js';
import type { DbPort } from '../sync/dbPort.js';

import { cycleChanges } from './cycleFlowChanges.js';
import { allocateCycleKey, changeCycleHash, cycleMeta, cycleStamp } from './cycleFlowFingerprint.js';
import { cycleWindow, selectCycleSuccessor } from './cycleFlowSelection.js';
import { EMPTY_CYCLE_HASH, type CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowOpenArgs, DailyFlowSettings } from './dailyFlowContract.js';
import { scopedDailyLearningSnapshot } from './dailyFlowGrade.js';
import { flowDay, flowPlan, fullDayCandidates, prepareFlowSession } from './dailyFlowPlanning.js';
import { readCurrentFlowLearning } from './dailyFlowReceipt.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { readDailyFlow, readCycleRows, saveCycleFlow, writeCycleRows, type CycleStored } from './dailyFlowStorage.js';

export async function initializeCycle(db: DbPort, args: DailyFlowOpenArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence) {
  const snapshot = await persistence.learningSnapshot(db);
  const seed = args.seed?.sessionStartedAt && flowDay(args.seed.sessionStartedAt, settings) === flowDay(args.now, settings)
    ? args.seed : undefined;
  const initial = prepareFlowSession(snapshot, args, settings, seed);
  const queue = initial.queueNodeIds;
  const pinned = initial.currentNodeId && !queue.includes(initial.currentNodeId) ? [initial.currentNodeId] : [];
  const soon = [...new Set([...(initial.hiddenSoonNodeIds ?? []), ...(initial.soonNodeIds ?? [])])];
  const ids = [...new Set([...queue, ...pinned, ...soon, ...fullDayCandidates(snapshot, args.now, settings)])];
  const rows: CycleRow[] = ids.map((node_id, index) => ({ node_id, order_key: index + 1, active: 1,
    handled: 0, cohort: queue.includes(node_id) ? 'queue' : soon.includes(node_id) ? 'soon' : 'none', initial_task: queue.includes(node_id) ? 1 : 0 }));
  const cycle = { clearKey: queue.length, clearedAt: null, scanAfter: 0, lapLimit: rows.length, tailKey: rows.length,
    rowsHash: changeCycleHash(EMPTY_CYCLE_HASH, [], rows), stamp: '', remaining: queue.length,
    reviewRemaining: queue.filter(id => isFsrsReviewItemNode(snapshot.nodesById[id])).length };
  await writeCycleRows(db, rows);
  const current = initial.currentNodeId;
  const session = { ...initial, currentNodeId: current, flowFormat: 'cycle-v1' as const, cycle };
  if (current) cycle.scanAfter = rows.find(row => row.node_id === current)!.order_key;
  else await chooseCycleCurrent(db, session, args.mode, args.now, settings, persistence);
  return { session, snapshot };
}

export async function reconcileCycle(db: DbPort, stored: CycleStored, now: string,
  settings: DailyFlowSettings, persistence: DailyFlowPersistence, captureChanges = false) {
  const snapshot = await persistence.learningSnapshot(db);
  const eligible = new Set(fullDayCandidates(snapshot, now, settings));
  const rows = await readCycleRows(db);
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
  await writeCycleRows(db, changes.rows());
  const final = new Map([...rows, ...changes.rows()].map(row => [row.node_id, row]));
  const remaining = [...final.values()].filter(row => row.active && row.initial_task);
  meta.remaining = remaining.length;
  meta.reviewRemaining = remaining.filter(row => isFsrsReviewItemNode(snapshot.nodesById[row.node_id])).length;
  delete meta.change;
  if (captureChanges) meta.change = changes.change();
  return { ...stored.session, cycle: meta };
}

export async function isCycleCurrentReady(db: DbPort, session: DailyFlowSession, mode: ReviewSessionMode,
  now: string, settings: DailyFlowSettings, persistence: DailyFlowPersistence) {
  const id = session.currentNodeId;
  if (!id) return false;
  const [row] = await readCycleRows(db, [id]);
  if (!row?.active) return false;
  const snapshot = await scopedDailyLearningSnapshot(db, persistence, [id]);
  const plan = flowPlan(snapshot, mode, now, settings);
  return (mode === 'review-first' ? plan.fsrsQueueNodeIds : mode === 'reading-only' ? plan.readingQueueNodeIds
    : [...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds]).includes(id);
}

export async function chooseCycleCurrent(db: DbPort, session: DailyFlowSession, mode: ReviewSessionMode,
  now: string, settings: DailyFlowSettings, persistence: DailyFlowPersistence) {
  const selected = await selectCycleSuccessor(db, session.cycle!, { mode, now, settings, persistence });
  session.currentNodeId = selected?.node_id ?? null;
  session.isAnswerRevealed = false;
  session.currentItemStartedAt = now;
  session.completedAt = selected ? null : session.cycle!.clearedAt;
  session.continueNodeId = null;
  return selected;
}

export async function openCycleFlow(db: DbPort, args: DailyFlowOpenArgs, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence, captureChanges = false) {
  let stored = await readDailyFlow(db);
  const dayKey = flowDay(args.now, settings);
  if (stored && stored.day_key !== dayKey) {
    await db.run('DELETE FROM daily_flow_entries');
    await db.run('DELETE FROM daily_flow_operations');
    stored = null;
    args = { ...args, seed: undefined, preferredNodeId: undefined };
  }
  let session: DailyFlowSession;
  if (!stored) session = (await initializeCycle(db, args, settings, persistence)).session;
  else {
    session = stored.invalidated || stored.settings_key !== JSON.stringify(settings)
      ? await reconcileCycle(db, stored, args.now, settings, persistence, captureChanges) : { ...stored.session, cycle: { ...stored.session.cycle! } };
    if (args.preferredNodeId && args.preferredNodeId !== session.currentNodeId) {
      const preferred = { ...session, currentNodeId: args.preferredNodeId };
      if (await isCycleCurrentReady(db, preferred, args.mode, args.now, settings, persistence)) {
        const [row] = await readCycleRows(db, [args.preferredNodeId]);
        session = { ...preferred, completedAt: null, currentItemStartedAt: args.now, isAnswerRevealed: false,
          cycle: { ...session.cycle!, scanAfter: row!.order_key } };
      }
    }
    if (!await isCycleCurrentReady(db, session, args.mode, args.now, settings, persistence)) {
      await chooseCycleCurrent(db, session, args.mode, args.now, settings, persistence);
    }
  }
  session = cycleWindow(session);
  if (captureChanges && session.cycle?.change) {
    session.cycle.stamp = cycleStamp(session.cycle, session);
    session.cycle.change.target = cycleMeta(session.cycle);
  }
  const unchanged = stored && !stored.invalidated && stored.mode === args.mode && stored.settings_key === JSON.stringify(settings)
    && cycleStamp(session.cycle!, session) === stored.session.cycle!.stamp
    && JSON.stringify(session.queueNodeIds) === JSON.stringify(stored.session.queueNodeIds);
  if (stored && unchanged && !args.refresh && !args.preferredNodeId) return { session: stored.session, learning: await readCurrentFlowLearning(db, persistence, stored.session.currentNodeId) };
  const saved = await saveCycleFlow(db, { dayKey, mode: args.mode, settingsKey: JSON.stringify(settings), now: args.now,
    revision: (stored?.revision ?? 0) + 1, session });
  return { session: saved, learning: await readCurrentFlowLearning(db, persistence, saved.currentNodeId) };
}
