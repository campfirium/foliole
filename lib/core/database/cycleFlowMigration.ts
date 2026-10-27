import { CYCLE_ENTRY_INDEX, CYCLE_ENTRY_SCHEMA } from '../flow/cycleFlowTypes.js';
import type { DbPort } from '../sync/dbPort.js';

import { planCycleFlowUpgrade, tagLegacyFlowHistory, type LegacyFlowRow, type LegacyFlowState } from './cycleFlowUpgradePlan.js';
import type { DatabaseMigrationTarget } from './migrationTypes.js';

const insert = `INSERT INTO daily_flow_entries (node_id, order_key, active, cohort, initial_task, handled)
  SELECT json_extract(value, '$.node_id'), json_extract(value, '$.order_key'), json_extract(value, '$.active'),
  json_extract(value, '$.cohort'), json_extract(value, '$.initial_task'), json_extract(value, '$.handled') FROM json_each(?)`;
const replace = ['ALTER TABLE daily_flow_entries RENAME TO daily_flow_entries_retired', CYCLE_ENTRY_SCHEMA, CYCLE_ENTRY_INDEX];

export function migrateCycleFlow(sqlite: DatabaseMigrationTarget) {
  const [state] = sqlite.prepare('SELECT * FROM daily_flow_state WHERE id = 1').all() as LegacyFlowState[];
  const entries = sqlite.prepare('SELECT * FROM daily_flow_entries').all() as LegacyFlowRow[];
  const planned = planCycleFlowUpgrade(state, entries);
  for (const sql of replace) sqlite.exec(sql);
  sqlite.prepare(insert).run(JSON.stringify(planned.rows));
  if (planned.session) sqlite.prepare('UPDATE daily_flow_state SET session_json = ?, invalidated = 1 WHERE id = 1')
    .run(JSON.stringify({ ...planned.session, queueNodeIds: planned.session.currentNodeId ? [planned.session.currentNodeId] : [], soonNodeIds: [], hiddenSoonNodeIds: [] }));
  sqlite.exec('ALTER TABLE daily_flow_operations ADD COLUMN source_session_json TEXT');
  sqlite.exec('DROP TABLE daily_flow_entries_retired');
}

export async function migrateCompanionCycleFlow(db: DbPort) {
  const [state] = await db.query<LegacyFlowState>('SELECT * FROM daily_flow_state WHERE id = 1');
  const planned = planCycleFlowUpgrade(state, await db.query<LegacyFlowRow>('SELECT * FROM daily_flow_entries'));
  for (const sql of replace) await db.run(sql);
  await db.run(insert, [JSON.stringify(planned.rows)]);
  if (planned.session) await db.run('UPDATE daily_flow_state SET session_json = ?, invalidated = 1 WHERE id = 1', [JSON.stringify({ ...planned.session, queueNodeIds: planned.session.currentNodeId ? [planned.session.currentNodeId] : [], soonNodeIds: [], hiddenSoonNodeIds: [] })]);
  const histories = await db.query<{ key: string; value: string }>("SELECT key, value FROM companion_meta WHERE substr(key,1,13)='flow_history:'");
  for (const row of histories) await db.run('UPDATE companion_meta SET value = ? WHERE key = ?',
    [JSON.stringify(tagLegacyFlowHistory(JSON.parse(row.value))), row.key]);
  await db.run('ALTER TABLE daily_flow_operations ADD COLUMN source_session_json TEXT');
  await db.run('DROP TABLE daily_flow_entries_retired');
}
