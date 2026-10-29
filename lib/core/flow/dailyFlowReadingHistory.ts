import type { DbPort } from '../sync/dbPort.js';

import type { DailyFlowSyncFact } from './dailyFlowSyncFact.js';
import { readDailyFlowSyncFact } from './dailyFlowSyncFact.js';
import { effectiveFlowActions } from './dailyFlowSyncMerge.js';

type Reading = NonNullable<DailyFlowSyncFact['readings']>[number]['after'];
function profile(reading: Reading) {
  if (!reading) return null;
  return { interval_duration_ms: reading.intervalDurationMs, interval_growth_factor: reading.intervalGrowthFactor,
    last_handled_at: reading.lastHandledAt, next_at: reading.nextAt, priority: reading.priority,
    repetition_count: reading.repetitionCount, state: reading.state };
}
function key(value: Record<string, unknown> | null) {
  return value ? JSON.stringify(Object.keys(profileKeys).map(field => value[field])) : 'null';
}
const profileKeys = { interval_duration_ms: true, interval_growth_factor: true, last_handled_at: true,
  next_at: true, priority: true, repetition_count: true, state: true };

/** A known targeted reversal outranks the canceled reading's old monotonic counters. */
export async function resolveFlowReadingHistoryPreference(db: DbPort, id: string, incoming: Record<string, unknown> | null) {
  const headers = await db.query<{ payload_json: string }>(`SELECT payload_json FROM daily_flow_sync_facts
    WHERE kind!='create' AND EXISTS(SELECT 1 FROM json_each(payload_json,'$.readings')
      WHERE json_extract(value,'$.nodeId')=?) ORDER BY occurred_at,id`, [id]);
  const facts = headers.map(row => readDailyFlowSyncFact(row.payload_json));
  const originals = facts.filter(fact => fact.kind === 'advance' && fact.readings?.some(value => value.nodeId === id));
  const ids = new Set(originals.map(fact => fact.id));
  if (!facts.some(fact => (fact.kind === 'undo' || fact.kind === 'redo') && fact.targetOpId && ids.has(fact.targetOpId))) return undefined;
  const changes = effectiveFlowActions(facts).flatMap(fact => fact.readings?.filter(value => value.nodeId === id &&
    key(profile(value.before)) !== key(profile(value.after))) ?? []);
  const original = originals.flatMap(fact => fact.readings!.filter(value => value.nodeId === id));
  const desired = changes.at(-1)?.after ?? original[0]?.before ?? null;
  const actual = key(incoming);
  if (actual === key(profile(desired))) return true;
  return original.some(value => actual === key(profile(value.after))) ? false : undefined;
}
