import type { DbPort } from '../sync/dbPort.js';

import { readDailyFlowSyncFact } from './dailyFlowSyncFact.js';

/** Only intervals alive when the latest list was created can be forks of that day's work. */
export async function readRelatedDailyFlowFacts(db: DbPort) {
  const [anchor] = await db.query<{ occurred_at: string; day_start: string; day_end: string }>(
    `SELECT occurred_at, day_start, day_end FROM daily_flow_sync_facts WHERE kind='create'
     ORDER BY day_start DESC, occurred_at DESC, id DESC LIMIT 1`);
  if (!anchor) return [];
  const instant = new Date(Math.max(Date.parse(anchor.day_start),
    Math.min(Date.parse(anchor.occurred_at), Date.parse(anchor.day_end) - 1))).toISOString();
  const records = await db.query<{ payload_json: string }>(
    'SELECT payload_json FROM daily_flow_sync_facts WHERE day_start <= ? AND day_end > ? ORDER BY occurred_at, id', [instant, instant]);
  return records.map(row => readDailyFlowSyncFact(row.payload_json));
}
