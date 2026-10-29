import type { DbPort } from '../sync/dbPort.js';

export async function replaceDailyFlowProjectionFacts(db: DbPort, ids: readonly string[]) {
  await db.run('DELETE FROM daily_flow_projection_facts');
  await db.run(`INSERT INTO daily_flow_projection_facts(fact_id) SELECT value FROM json_each(?)`, [JSON.stringify(ids)]);
}

export async function appendDailyFlowProjectionFact(db: DbPort, id: string) {
  await db.run('INSERT OR IGNORE INTO daily_flow_projection_facts(fact_id) VALUES (?)', [id]);
}

export async function readDailyFlowProjectionFacts(db: DbPort) {
  return (await db.query<{ fact_id: string }>('SELECT fact_id FROM daily_flow_projection_facts ORDER BY fact_id')).map(row => row.fact_id);
}
