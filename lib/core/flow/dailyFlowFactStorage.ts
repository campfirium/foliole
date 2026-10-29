import type { DbPort } from '../sync/dbPort.js';

import { joinDailyFlowRows, separateDailyFlowRows, type DailyFlowFactRow } from './dailyFlowFactRowCodec.js';
import type { DailyFlowSyncFact } from './dailyFlowSyncFact.js';

export const INSERT_DAILY_FLOW_FACT_ROWS = `INSERT INTO daily_flow_fact_rows
  (fact_id, slot, ordinal, node_id, order_key, active, cohort, handled, initial_task)
  SELECT json_extract(value,'$.fact_id'), json_extract(value,'$.slot'), json_extract(value,'$.ordinal'),
    json_extract(value,'$.node_id'), json_extract(value,'$.order_key'), json_extract(value,'$.active'),
    json_extract(value,'$.cohort'), json_extract(value,'$.handled'), json_extract(value,'$.initial_task') FROM json_each(?)`;

export async function insertDailyFlowFactRows(db: DbPort, rows: readonly DailyFlowFactRow[]) {
  for (let offset = 0; offset < rows.length; offset += 256) {
    await db.run(INSERT_DAILY_FLOW_FACT_ROWS, [JSON.stringify(rows.slice(offset, offset + 256))]);
  }
}

export async function storeDailyFlowFact(db: DbPort, fact: DailyFlowSyncFact) {
  const { header, rows } = separateDailyFlowRows(fact);
  await db.run(`INSERT INTO daily_flow_sync_facts
    (id, root_id, occurred_at, day_start, payload_json, day_end, parent_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  [fact.id, fact.rootId, fact.occurredAt, fact.settings.dayWindow.start, JSON.stringify(header),
    fact.settings.dayWindow.end, fact.parentId, fact.kind]);
  await insertDailyFlowFactRows(db, rows);
  if (fact.kind === 'create') await db.run(`INSERT INTO daily_flow_lists (list_id, row_count, complete)
    VALUES (?, ?, 1)`, [fact.id, fact.rows.length]);
}

export async function readDailyFlowFact(db: DbPort, id: string): Promise<DailyFlowSyncFact | null> {
  const [header] = await db.query<{ payload_json: string }>('SELECT payload_json FROM daily_flow_sync_facts WHERE id=?', [id]);
  if (!header) return null;
  const rows = await db.query<DailyFlowFactRow>(
    'SELECT * FROM daily_flow_fact_rows WHERE fact_id=? ORDER BY slot, ordinal', [id]);
  return joinDailyFlowRows(header.payload_json, rows);
}
