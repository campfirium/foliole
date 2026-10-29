import type { DbPort } from '../sync/dbPort.js';
import { writeDbStatements } from '../sync/dbStatements.js';

import type { CycleRow } from './cycleFlowTypes.js';
import { dailyFlowSessionSchema } from './dailyFlowSessionSchema.js';
import { cycleStateToSave, type CycleSaveArgs } from './dailyFlowStore.js';
import type { CycleStored } from './dailyFlowStore.js';
export type { CycleStored } from './dailyFlowStore.js';

export async function readDailyFlow(db: DbPort): Promise<CycleStored | null> {
  const [row] = await db.query<Omit<CycleStored, 'session'>>('SELECT * FROM daily_flow_state WHERE id = 1');
  if (!row) return null;
  const session = dailyFlowSessionSchema.parse({ ...JSON.parse(row.session_json),
    daily: { scope: (JSON.parse(row.settings_key) as { scope?: string }).scope ?? '', dayKey: row.day_key, revision: row.revision } });
  if (session.flowFormat !== 'cycle-v1' || !session.cycle) throw new Error('daily_flow_format_changed');
  return { ...row, session };
}

export function readCycleRows(db: DbPort, ids?: readonly string[]) {
  return db.query<CycleRow>(ids ? 'SELECT * FROM daily_flow_entries WHERE node_id IN (SELECT value FROM json_each(?))'
    : 'SELECT * FROM daily_flow_entries ORDER BY order_key', ids ? [JSON.stringify(ids)] : []);
}

export async function writeCycleRows(db: DbPort, rows: CycleRow[]) {
  if (!rows.length) return;
  await writeDbStatements(db, [{ sql: 'DELETE FROM daily_flow_entries WHERE node_id IN (SELECT value FROM json_each(?))',
    params: [JSON.stringify(rows.map(row => row.node_id))] }, cycleRowsStatement(rows)]);
}

export async function insertCycleRows(db: DbPort, rows: CycleRow[]) {
  if (!rows.length) return;
  await writeDbStatements(db, [cycleRowsStatement(rows)]);
}

function cycleRowsStatement(rows: CycleRow[]) {
  return { sql: `INSERT INTO daily_flow_entries (node_id, order_key, active, cohort, initial_task, handled)
    SELECT json_extract(value, '$.node_id'), json_extract(value, '$.order_key'), json_extract(value, '$.active'),
    json_extract(value, '$.cohort'), json_extract(value, '$.initial_task'), json_extract(value, '$.handled') FROM json_each(?)`,
    params: [JSON.stringify(rows)] };
}

export async function saveCycleFlow(db: DbPort, args: CycleSaveArgs) {
  const saved = cycleStateToSave(args);
  await db.run(`INSERT INTO daily_flow_state (id, day_key, revision, settings_key, mode, session_json, invalidated, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, 0, ?) ON CONFLICT(id) DO UPDATE SET day_key=excluded.day_key,
    revision=excluded.revision, settings_key=excluded.settings_key, mode=excluded.mode,
    session_json=excluded.session_json, invalidated=0, updated_at=excluded.updated_at`,
  [saved.day_key, saved.revision, saved.settings_key, saved.mode, saved.session_json, args.now]);
  return saved.session;
}
