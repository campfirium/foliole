import { selectLocalDailyFlowFacts } from '../flow/dailyFlowLocalApplication.js';
import { groupActions, localFlowTotals } from '../flow/dailyFlowOperationContributions.js';
import type { DailyFlowSession } from '../flow/dailyFlowSession.js';
import { readDailyFlowSyncFact } from '../flow/dailyFlowSyncFact.js';
import type { DbPort } from '../sync/dbPort.js';

import { DAILY_FLOW_LOCAL_APPLICATION_SCHEMA } from './dailyFlowLocalApplicationSchema.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

type State = { day_key: string; session_json: string };
type Header = { payload_json: string };
const known = `SELECT f.payload_json FROM daily_flow_sync_facts f
  JOIN daily_flow_projection_facts p ON p.fact_id=f.id WHERE f.kind!='create' AND f.day_start<? AND f.day_end>? ORDER BY f.occurred_at,f.id`;
const before = `SELECT r.node_id,r.order_key,r.active,r.cohort,r.handled,r.initial_task FROM daily_flow_fact_rows r
  JOIN daily_flow_sync_facts f ON f.id=r.fact_id JOIN daily_flow_operations o ON o.op_id=f.id
  WHERE r.slot='before' AND f.day_start=? AND f.day_end=? ORDER BY f.occurred_at,f.id,r.ordinal`;
const retireListPublication = [
  `UPDATE sync_object_state SET sync_dirty=0 WHERE object_type='daily_flow'
    AND object_id IN (SELECT id FROM daily_flow_sync_facts WHERE kind='create')`
];
const rowInsert = 'INSERT OR IGNORE INTO daily_flow_local_operation_rows(day_key,node_id,before_json) VALUES(?,?,?)';
const stateInsert = 'INSERT OR IGNORE INTO daily_flow_local_operation_state(day_key,base_json) VALUES(?,?)';

function dayWindow(state: State) { return (JSON.parse(state.session_json) as DailyFlowSession).dayWindow; }

function baseStatistics(state: State, headers: Header[]) {
  const session = JSON.parse(state.session_json) as DailyFlowSession;
  const window = session.dayWindow;
  const facts = window ? selectLocalDailyFlowFacts(headers.map(row => readDailyFlowSyncFact(row.payload_json)), window.start, window.end) : [];
  const contribution = localFlowTotals(facts, groupActions(facts), new Map());
  for (const key of Object.keys(contribution) as (keyof typeof contribution)[]) {
    contribution[key] = Math.max(0, (session[key] ?? 0) - contribution[key]);
  }
  return JSON.stringify(contribution);
}

/** Preserve the live local table and old facts; seed only scalar offsets and owned row history. */
export function migrateDailyFlowLocalApplications(db: DatabaseMigrationTarget) {
  for (const sql of [...DAILY_FLOW_LOCAL_APPLICATION_SCHEMA, ...retireListPublication]) db.exec(sql);
  const state = db.prepare('SELECT day_key,session_json FROM daily_flow_state WHERE id=1').all()[0] as State | undefined;
  if (!state) return;
  const window = dayWindow(state);
  db.prepare(stateInsert).run(state.day_key, baseStatistics(state, window ? db.prepare(known).all(window.end, window.start) as Header[] : []));
  for (const row of (window ? db.prepare(before).all(window.start, window.end) : []) as { node_id: string }[]) {
    db.prepare(rowInsert).run(state.day_key, row.node_id, JSON.stringify(row));
  }
}

export async function migrateCompanionDailyFlowLocalApplications(db: DbPort) {
  for (const sql of [...DAILY_FLOW_LOCAL_APPLICATION_SCHEMA, ...retireListPublication]) await db.run(sql);
  const [state] = await db.query<State>('SELECT day_key,session_json FROM daily_flow_state WHERE id=1');
  if (!state) return;
  const window = dayWindow(state);
  await db.run(stateInsert, [state.day_key, baseStatistics(state, window ? await db.query<Header>(known, [window.end, window.start]) : [])]);
  for (const row of (window ? await db.query<{ node_id: string }>(before, [window.start, window.end]) : [])) {
    await db.run(rowInsert, [state.day_key, row.node_id, JSON.stringify(row)]);
  }
}
