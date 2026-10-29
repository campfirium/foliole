import { hasDeletedAncestor, hasShelvedAncestor } from '../review/queue/reviewQueuePlannerHelpers.js';
import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import { isFsrsReviewItemNode } from '../review/reviewItemKind.js';
import type { DbPort } from '../sync/dbPort.js';

import { buildCycle } from './cycleFlowBuild.js';
import { cycleWindow } from './cycleFlowSelection.js';
import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowSettings, DailyFlowLearningSnapshot } from './dailyFlowContract.js';
import { dailyFlowSettingsForInstant } from './dailyFlowDayWindow.js';
import { applyLocalDailyFlowOperations } from './dailyFlowLocalApplication.js';
import { dailyFlowMembershipHash } from './dailyFlowMembership.js';
import { flowDay, prepareDailyFlowCandidates, prepareDailyFlowPlans } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import { insertCycleRows, readCycleRows, readDailyFlow, saveCycleFlow } from './dailyFlowStorage.js';
import type { CycleStored } from './dailyFlowStore.js';

/** Refresh only an existing current-day list, after a confirmed database exchange. */
export function refreshDailyFlowAfterSync(db: DbPort, now: string, settings: DailyFlowSettings,
  persistence: DailyFlowPersistence): Promise<boolean> {
  return db.transaction(async tx => {
    const config = await dailyFlowSettingsForInstant(tx, settings, now);
    const before = await readDailyFlow(tx);
    if (!before || before.day_key !== flowDay(now, config)) return false;
    await applyLocalDailyFlowOperations(tx, now);
    const stored = (await readDailyFlow(tx))!;
    const snapshot = await persistence.learningSnapshot(tx);
    const candidates = prepareDailyFlowCandidates(snapshot, now, config);
    const ids = [...candidates.candidates.fsrsCandidates, ...candidates.candidates.readingCandidates].map(node => node.id);
    const hash = dailyFlowMembershipHash(ids);
    if (stored.session.candidateMembershipHash === hash) return false;
    const rows = await readCycleRows(tx);
    // Installed lists have no baseline yet; compare their original membership without rebuilding them.
    if (!stored.session.candidateMembershipHash && dailyFlowMembershipHash(rows.map(row => row.node_id)) === hash) {
      await tx.run('UPDATE daily_flow_state SET session_json=? WHERE id=1',
        [JSON.stringify({ ...stored.session, daily: undefined, candidateMembershipHash: hash })]);
      return false;
    }
    const mode = stored.mode as ReviewSessionMode;
    const plans = prepareDailyFlowPlans(snapshot, { now, mode }, config, candidates);
    await replaceList(tx, stored, snapshot, rows, now, config, plans);
    return true;
  });
}

function keepDisplayed(stored: CycleStored, snapshot: DailyFlowLearningSnapshot) {
  const id = stored.session.currentNodeId;
  const node = id ? snapshot.nodesById[id] : undefined;
  return Boolean(node && !snapshot.trashedNodeIds.includes(node.id) &&
    !hasDeletedAncestor(node, snapshot.nodesById) && !hasShelvedAncestor(node, snapshot.nodesById));
}

async function replaceList(db: DbPort, stored: CycleStored, snapshot: DailyFlowLearningSnapshot,
  oldRows: CycleRow[], now: string, settings: DailyFlowSettings, plans: ReturnType<typeof prepareDailyFlowPlans>) {
  const mode = stored.mode as ReviewSessionMode;
  const soon = oldRows.filter(row => row.cohort === 'soon').map(row => row.node_id);
  const built = buildCycle(snapshot, { now, mode }, settings, plans);
  const old = new Map(oldRows.map(row => [row.node_id, row]));
  const retained = oldRows.filter(row => row.handled && row.cohort !== 'soon')
    .map(row => ({ ...row, active: 0 as const, initial_task: 0 as const }));
  const handled = new Set(retained.map(row => row.node_id));
  const planned = built.rows.filter(row => !handled.has(row.node_id)).map(row => ({ ...row,
    ...(old.get(row.node_id)?.cohort === 'soon' ? { cohort: 'soon' as const,
      handled: old.get(row.node_id)!.handled, initial_task: 0 as const } : {}) }));
  const byId = new Map(planned.map(row => [row.node_id, row]));
  const deferred = soon.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
  const fresh = [...planned.filter(row => row.initial_task), ...deferred,
    ...planned.filter(row => !row.initial_task && row.cohort !== 'soon')];
  const current = keepDisplayed(stored, snapshot) ? stored.session.currentNodeId : null;
  if (current) {
    const existing = fresh.find(row => row.node_id === current) ?? retained.find(row => row.node_id === current);
    const pinned: CycleRow = { ...(existing ?? { node_id: current, cohort: 'none', initial_task: 0, handled: 0, order_key: 1 }), active: 1 };
    fresh.splice(0, fresh.length, pinned, ...fresh.filter(row => row.node_id !== current));
  }
  // New positions cannot collide with pre-refresh positions retained by targeted undo/redo.
  const offset = oldRows.reduce((tail, row) => Math.max(tail, row.order_key), stored.session.cycle!.tailKey);
  if (!Number.isSafeInteger(offset + fresh.length)) throw new Error('daily_flow_order_exhausted');
  fresh.forEach((row, index) => { row.order_key = offset + index + 1; });
  const rows = [...retained.filter(row => row.node_id !== current), ...fresh];
  const pending = fresh.filter(row => row.active && row.initial_task);
  const session = { ...built.session, ...stored.session, candidateMembershipHash: built.session.candidateMembershipHash,
    rebuildSourceRevision: stored.session.rebuildSourceRevision ?? stored.revision,
    currentNodeId: current, cycle: { ...built.session.cycle!,
      clearKey: pending.at(-1)?.order_key ?? offset, clearedAt: pending.length ? null : stored.session.cycle!.clearedAt,
      scanAfter: current ? fresh[0]!.order_key : offset, lapLimit: offset + fresh.length, tailKey: offset + fresh.length,
      remaining: pending.length, reviewRemaining: pending.filter(row => isFsrsReviewItemNode(snapshot.nodesById[row.node_id])).length },
    totalNodeCount: (stored.session.readTopicCount ?? 0) + (stored.session.reviewedItemCount ?? 0) + pending.length };
  await db.run('DELETE FROM daily_flow_entries');
  await insertCycleRows(db, rows);
  await saveCycleFlow(db, { dayKey: stored.day_key, mode, settingsKey: JSON.stringify(settings), now,
    revision: stored.revision + 1, session: cycleWindow(session) });
}
