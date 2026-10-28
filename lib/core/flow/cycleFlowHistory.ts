
import { cycleMeta, sameCycleProgress } from './cycleFlowState.js';
import type { CycleMeta } from './cycleFlowTypes.js';
import type { DailyFlowCommitArgs } from './dailyFlowContract.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { DailyFlowStore } from './dailyFlowStore.js';

function sameMeta(left: CycleMeta, right: CycleMeta) {
  const a = { ...cycleMeta(left), tailKey: 0 };
  const b = { ...cycleMeta(right), tailKey: 0 };
  return JSON.stringify(a) === JSON.stringify(b);
}

function rowIdentity(rows: import('./cycleFlowTypes.js').CycleRow[]) {
  return JSON.stringify(rows.map(row => [row.node_id, row.order_key, row.active, row.cohort, row.initial_task, row.handled]));
}

export async function replayCycleHistory(db: DailyFlowStore, source: DailyFlowSession, args: DailyFlowCommitArgs) {
  const change = args.cycleReplay;
  const target = args.nextSession;
  if (!change || !target?.cycle || !source.cycle || !args.historySourceSession?.cycle) throw new Error('flow_history_unavailable');
  const undo = args.historyMode === 'undo';
  const expected = undo ? change.target : change.source;
  const destination = undo ? change.source : change.target;
  if (!sameMeta(source.cycle, expected) || !sameCycleProgress(args.historySourceSession, source)
    || !sameMeta(target.cycle, destination)) {
    throw new Error('flow_history_changed');
  }
  const before = undo ? change.after : change.before;
  const after = undo ? change.before : change.after;
  const ids = [...new Set([...before, ...after].map(row => row.node_id))];
  const actual = await db.readRows(ids);
  const sort = (rows: typeof actual) => [...rows].sort((a, b) => a.node_id.localeCompare(b.node_id));
  if (rowIdentity(sort(actual)) !== rowIdentity(sort(before))) throw new Error('flow_history_changed');
  await db.deleteRows(ids);
  await db.writeRows(after);
  return { ...target, cycle: { ...destination, tailKey: Math.max(source.cycle.tailKey, destination.tailKey),
    ...(undo ? {} : { change }) } };
}
