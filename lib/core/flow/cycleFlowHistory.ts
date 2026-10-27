import type { DbPort } from '../sync/dbPort.js';

import { changeCycleHash, cycleMeta, cycleStamp } from './cycleFlowFingerprint.js';
import type { CycleMeta } from './cycleFlowTypes.js';
import type { DailyFlowCommitArgs } from './dailyFlowContract.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import { readCycleRows, writeCycleRows } from './dailyFlowStorage.js';

function sameMeta(left: CycleMeta, right: CycleMeta) {
  const a = { ...cycleMeta(left), tailKey: 0 };
  const b = { ...cycleMeta(right), tailKey: 0 };
  return JSON.stringify(a) === JSON.stringify(b);
}

function rowIdentity(rows: import('./cycleFlowTypes.js').CycleRow[]) {
  return JSON.stringify(rows.map(row => [row.node_id, row.order_key, row.active, row.cohort, row.initial_task, row.handled]));
}

export async function replayCycleHistory(db: DbPort, source: DailyFlowSession, args: DailyFlowCommitArgs) {
  const change = args.cycleReplay;
  const target = args.nextSession;
  if (!change || !target?.cycle || !source.cycle || !args.historySourceSession?.cycle) throw new Error('flow_history_unavailable');
  const undo = args.historyMode === 'undo';
  const expected = undo ? change.target : change.source;
  const destination = undo ? change.source : change.target;
  if (!sameMeta(source.cycle, expected) || args.historySourceSession.cycle.stamp !== source.cycle.stamp
    || !sameMeta(target.cycle, destination) || cycleStamp(target.cycle, target) !== destination.stamp) {
    throw new Error('flow_history_changed');
  }
  const before = undo ? change.after : change.before;
  const after = undo ? change.before : change.after;
  const ids = [...new Set([...before, ...after].map(row => row.node_id))];
  const actual = await readCycleRows(db, ids);
  const sort = (rows: typeof actual) => [...rows].sort((a, b) => a.node_id.localeCompare(b.node_id));
  if (rowIdentity(sort(actual)) !== rowIdentity(sort(before)) ||
    changeCycleHash(source.cycle.rowsHash, before, after) !== destination.rowsHash) throw new Error('flow_history_changed');
  await db.run('DELETE FROM daily_flow_entries WHERE node_id IN (SELECT value FROM json_each(?))', [JSON.stringify(ids)]);
  await writeCycleRows(db, after);
  return { ...target, cycle: { ...destination, tailKey: Math.max(source.cycle.tailKey, destination.tailKey),
    ...(undo ? {} : { change }) } };
}
