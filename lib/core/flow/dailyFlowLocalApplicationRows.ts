import type { DbPort } from '../sync/dbPort.js';
import type { DbStatement } from '../sync/dbStatements.js';

import { cycleRowSchema, type CycleRow } from './cycleFlowTypes.js';

export async function rememberLocalFlowRows(db: DbPort, dayKey: string, ids: readonly string[], before?: CycleRow[]) {
  if (!ids.length) return;
  const rows = before ?? await db.query<CycleRow>(
    'SELECT * FROM daily_flow_entries WHERE node_id IN (SELECT value FROM json_each(?))', [JSON.stringify(ids)]);
  const statement = localFlowRowsStatement(dayKey, ids, rows);
  await db.run(statement.sql, statement.params);
}

export function localFlowRowsStatement(dayKey: string, ids: readonly string[], rows: CycleRow[]): DbStatement {
  const byId = new Map(rows.map(row => [row.node_id, row]));
  return { sql:`INSERT OR IGNORE INTO daily_flow_local_operation_rows(day_key,node_id,before_json)
    SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.row') FROM json_each(?)`,
  params: [dayKey, JSON.stringify(ids.map(id => ({ id, row: byId.has(id) ? JSON.stringify(byId.get(id)) : null })))] };
}

export async function readLocalFlowRows(db: DbPort, dayKey: string) {
  const rows = await db.query<{ node_id: string; before_json: string | null }>(
    'SELECT node_id,before_json FROM daily_flow_local_operation_rows WHERE day_key=?', [dayKey]);
  return new Map(rows.map(row => [row.node_id, row.before_json ? cycleRowSchema.parse(JSON.parse(row.before_json)) : null]));
}
