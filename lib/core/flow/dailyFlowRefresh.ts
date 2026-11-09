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
    // Local learning already changes active rows. Keep their positions when
    // a sync round finds the same live membership.
    const activeHash = dailyFlowMembershipHash(rows.filter(row => row.active).map(row => row.node_id));
    const installedHash = stored.session.candidateMembershipHash ? undefined : dailyFlowMembershipHash(rows.map(row => row.node_id));
    if (activeHash === hash || installedHash === hash) {
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
  const built = buildCycle(snapshot, { now, mode }, settings, plans);
  const old = new Map(oldRows.map(row => [row.node_id, row]));
  const current = keepDisplayed(stored, snapshot) ? stored.session.currentNodeId : null;
  const previous = stored.session.cycle!;
  const tail = oldRows.reduce((key, row) => Math.max(key, row.order_key), previous.tailKey);
  const { rows, tailKey } = refreshRows(built.rows, old, current, tail);
  const pending = rows.filter(row => row.active && row.initial_task);
  const session = { ...built.session, ...stored.session, candidateMembershipHash: built.session.candidateMembershipHash,
    rebuildSourceRevision: stored.session.rebuildSourceRevision ?? stored.revision,
    currentNodeId: current, cycle: { ...built.session.cycle!,
      clearKey: pending.reduce((key, row) => Math.max(key, row.order_key), previous.clearKey), clearedAt: pending.length ? null : stored.session.cycle!.clearedAt,
      scanAfter: previous.scanAfter, lapLimit: tailKey, tailKey,
      remaining: pending.length, reviewRemaining: pending.filter(row => isFsrsReviewItemNode(snapshot.nodesById[row.node_id])).length },
    totalNodeCount: (stored.session.readTopicCount ?? 0) + (stored.session.reviewedItemCount ?? 0) + pending.length };
  await db.run('DELETE FROM daily_flow_entries');
  await insertCycleRows(db, rows);
  await saveCycleFlow(db, { dayKey: stored.day_key, mode, settingsKey: JSON.stringify(settings), now,
    revision: stored.revision + 1, session: cycleWindow(session) });
}

function refreshRows(planned: CycleRow[], old: Map<string, CycleRow>, current: string | null, tailKey: number) {
  const rows = new Map<string, CycleRow>();
  for (const candidate of planned) {
    const before = old.get(candidate.node_id);
    // A surviving row keeps its slot and round flags. New work joins after open round boundaries.
    if (before?.active) rows.set(candidate.node_id, before);
    else if (before?.handled && before.cohort !== 'soon') rows.set(candidate.node_id, before);
    else rows.set(candidate.node_id, { ...candidate, order_key: ++tailKey });
  }
  for (const before of old.values()) {
    if (rows.has(before.node_id)) continue;
    if (before.node_id === current) rows.set(before.node_id, { ...before, active: 1, initial_task: 0 });
    else if (before.handled) rows.set(before.node_id, { ...before, active: 0, initial_task: 0 });
  }
  if (!Number.isSafeInteger(tailKey)) throw new Error('daily_flow_order_exhausted');
  return { rows: [...rows.values()], tailKey };
}
