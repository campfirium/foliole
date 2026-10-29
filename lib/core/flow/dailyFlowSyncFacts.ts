import type { DbPort } from '../sync/dbPort.js';

import { readDailyFlowFact } from './dailyFlowFactStorage.js';

/** Only intervals alive when the latest list was created can be forks of that day's work. */
export async function readRelatedDailyFlowFacts(db: DbPort) {
  const [anchor] = await db.query<{ occurred_at: string; day_start: string; day_end: string }>(
    `SELECT occurred_at, day_start, day_end FROM daily_flow_sync_facts WHERE kind='create'
     ORDER BY day_start DESC, occurred_at DESC, id DESC LIMIT 1`);
  if (!anchor) return [];
  const instant = new Date(Math.max(Date.parse(anchor.day_start),
    Math.min(Date.parse(anchor.occurred_at), Date.parse(anchor.day_end) - 1))).toISOString();
  const records = await db.query<{ id: string }>(
    'SELECT id FROM daily_flow_sync_facts WHERE day_start <= ? AND day_end > ? ORDER BY occurred_at, id', [instant, instant]);
  const facts = [];
  for (const row of records) {
    const fact = await readDailyFlowFact(db, row.id);
    if (!fact) throw new Error('daily_flow_fact_missing');
    facts.push(fact);
  }
  return facts;
}
