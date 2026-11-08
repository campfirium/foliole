import type { DbPort } from '../sync/dbPort.js';

import { allocateCycleKey } from './cycleFlowState.js';
import type { CycleMeta, CycleRow } from './cycleFlowTypes.js';
import { readLocalFlowRows, rememberLocalFlowRows } from './dailyFlowLocalApplicationRows.js';
import { groupActions, localFlowTotals, type ActionGroups } from './dailyFlowOperationContributions.js';
import { readDailyFlowProjectionFacts, replaceDailyFlowProjectionFacts } from './dailyFlowProjectionFacts.js';
import { readCycleRows, readDailyFlow, saveCycleFlow, writeCycleRows } from './dailyFlowStorage.js';
import type { CycleStored } from './dailyFlowStore.js';
import { readDailyFlowSyncFact, type DailyFlowSyncFact } from './dailyFlowSyncFact.js';

export async function readLocalDailyFlowFacts(db: DbPort, start: string, end: string) {
  const headers = await db.query<{ payload_json: string }>(`SELECT payload_json FROM daily_flow_sync_facts
    WHERE kind!='create' AND day_start<? AND day_end>? ORDER BY occurred_at,id`, [end, start]);
  return selectLocalDailyFlowFacts(headers.map(row => readDailyFlowSyncFact(row.payload_json)), start, end);
}

export function selectLocalDailyFlowFacts(facts: DailyFlowSyncFact[], start: string, end: string) {
  const selected = new Set(facts.filter(fact => fact.kind === 'advance' &&
    ((fact.occurredAt >= start && fact.occurredAt < end) ||
      (fact.settings.dayWindow.start === start && fact.settings.dayWindow.end === end))).map(fact => fact.id));
  return facts.filter(fact => selected.has(fact.id) ||
    (fact.targetOpId ? selected.has(fact.targetOpId) || (fact.kind !== 'advance' &&
      !facts.some(value => value.id === fact.targetOpId) && fact.settings.dayWindow.start === start) : fact.kind !== 'advance'));
}

function changedMembers(before: ActionGroups, after: ActionGroups) {
  return [...new Set([...before.keys(), ...after.keys()])].filter(id => before.get(id)?.at(-1)?.id !== after.get(id)?.at(-1)?.id);
}

/** Apply shared learning effects to this device's rows; foreign positions and cursors are never installed. */
export async function applyLocalDailyFlowOperations(db: DbPort, now: string, currentState?: CycleStored | null, restoredRows?: ReadonlySet<string>) {
  const stored = currentState === undefined ? await readDailyFlow(db) : currentState;
  if (!stored?.session.dayWindow) return false;
  const { start, end } = stored.session.dayWindow;
  const pending = await db.query(`SELECT 1 WHERE EXISTS (
    SELECT 1 FROM daily_flow_sync_facts f LEFT JOIN daily_flow_projection_facts p ON p.fact_id=f.id
    WHERE f.kind!='create' AND f.day_start<? AND f.day_end>? AND p.fact_id IS NULL
  ) OR EXISTS (SELECT 1 FROM daily_flow_projection_facts p WHERE NOT EXISTS (
    SELECT 1 FROM daily_flow_sync_facts f WHERE f.id=p.fact_id AND f.kind!='create' AND f.day_start<? AND f.day_end>?
  ))`, [end, start, end, start]);
  if (!pending.length) return false;
  const facts = await readLocalDailyFlowFacts(db, start, end);
  const applied = new Set(await readDailyFlowProjectionFacts(db));
  const ids = facts.map(fact => fact.id);
  const known = new Set(ids);
  if (ids.every(id => applied.has(id)) && [...applied].every(id => known.has(id))) return false;
  const before = groupActions(facts.filter(fact => applied.has(fact.id)));
  const after = groupActions(facts);
  const affected = changedMembers(before, after);
  await rememberLocalFlowRows(db, stored.day_key, affected);
  const baseline = await readLocalFlowRows(db, stored.day_key);
  const current = new Map((await readCycleRows(db, affected)).map(row => [row.node_id, row]));
  const cycle = { ...stored.session.cycle! };
  const changes: CycleRow[] = [];
  const returning: CycleRow[] = [];
  for (const id of affected) {
    if (restoredRows?.has(id)) continue;
    const latest = after.get(id)?.at(-1);
    const row = current.get(id);
    const original = baseline.get(id);
    if (!latest || (latest.kind === 'undo' && !latest.targetOpId)) {
      if (original) returning.push(original);
      else if (row) changes.push({ ...row, handled: 0, cohort: 'none', initial_task: 0 });
    } else changes.push({ node_id: id, order_key: allocateCycleKey(cycle), active: latest.action === 'soon' ? 1 : row?.active ?? 0,
      handled: 1, cohort: latest.action === 'soon' ? 'soon' : 'none', initial_task: 0 });
  }
  await writeCycleRows(db, [...changes, ...await restoreLocalFlowPositions(db, changes, returning, cycle)]);
  const stats = localFlowTotals(facts, after, baseline);
  const [initial] = await db.query<{ base_json: string }>('SELECT base_json FROM daily_flow_local_operation_state WHERE day_key=?', [stored.day_key]);
  const base = initial ? JSON.parse(initial.base_json) as typeof stats : { readingElapsedMs: 0, reviewElapsedMs: 0, readTopicCount: 0, reviewedItemCount: 0 };
  for (const key of Object.keys(stats) as (keyof typeof stats)[]) stats[key] = Math.max(0, stats[key] + base[key]);
  await saveCycleFlow(db, { dayKey: stored.day_key, mode: stored.mode, settingsKey: stored.settings_key,
    now, revision: stored.revision, session: { ...stored.session, ...stats, cycle } });
  await db.run('UPDATE daily_flow_state SET invalidated=1 WHERE id=1');
  await replaceDailyFlowProjectionFacts(db, ids);
  return true;
}

async function restoreLocalFlowPositions(db: DbPort, changes: CycleRow[], returning: CycleRow[], cycle: CycleMeta) {
  if (!returning.length) return returning;
  const moving = new Set([...changes, ...returning].map(row => row.node_id));
  const occupied = await db.query<Pick<CycleRow, 'node_id' | 'order_key'>>(`
    SELECT node_id, order_key FROM daily_flow_entries
    WHERE order_key IN (SELECT value FROM json_each(?))`, [JSON.stringify(returning.map(row => row.order_key))]);
  const reserved = new Set(occupied.filter(row => !moving.has(row.node_id)).map(row => row.order_key));
  // A remote undo can restore learning while a local continuation still owns the original position.
  return returning.map(row => {
    if (reserved.has(row.order_key)) return { ...row, order_key: allocateCycleKey(cycle) };
    reserved.add(row.order_key);
    return row;
  });
}
