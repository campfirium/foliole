import type { DbRow } from '../sync/dbPort.js';

import { cycleRowSchema, type CycleRow } from './cycleFlowTypes.js';
import { readDailyFlowSyncFact, type DailyFlowSyncFact } from './dailyFlowSyncFact.js';

export const DAILY_FLOW_ROW_SLOTS = ['rows', 'removedNodeIds', 'before', 'after'] as const;
export type DailyFlowRowSlot = typeof DAILY_FLOW_ROW_SLOTS[number];
export interface DailyFlowFactRow extends DbRow {
  fact_id: string; slot: DailyFlowRowSlot; ordinal: number; node_id: string;
  order_key: number | null; active: number | null; cohort: string | null;
  handled: number | null; initial_task: number | null;
}

function arrays(fact: DailyFlowSyncFact): Partial<Record<DailyFlowRowSlot, readonly (CycleRow | string)[]>> {
  return { rows: fact.rows, removedNodeIds: fact.removedNodeIds,
    ...(fact.session.cycle?.change ? { before: fact.session.cycle.change.before, after: fact.session.cycle.change.after } : {}) };
}

export function separateDailyFlowRows(fact: DailyFlowSyncFact) {
  const header = structuredClone(fact);
  header.rows = []; header.removedNodeIds = [];
  if (header.session.cycle?.change) {
    header.session.cycle.change.before = []; header.session.cycle.change.after = [];
  }
  const rows: DailyFlowFactRow[] = [];
  for (const slot of DAILY_FLOW_ROW_SLOTS) for (const [ordinal, value] of (arrays(fact)[slot] ?? []).entries()) {
    rows.push({ fact_id: fact.id, slot, ordinal, node_id: typeof value === 'string' ? value : value.node_id,
      order_key: typeof value === 'string' ? null : value.order_key,
      active: typeof value === 'string' ? null : value.active,
      cohort: typeof value === 'string' ? null : value.cohort,
      handled: typeof value === 'string' ? null : value.handled,
      initial_task: typeof value === 'string' ? null : value.initial_task });
  }
  return { header, rows };
}

export function joinDailyFlowRows(header: string, rows: readonly DailyFlowFactRow[]) {
  const fact = readDailyFlowSyncFact(header);
  const targets = arrays(fact) as Partial<Record<DailyFlowRowSlot, (CycleRow | string)[]>>;
  if (Object.values(targets).some(value => value.length)) throw new Error('daily_flow_header_contains_rows');
  for (const row of rows) {
    const target = targets[row.slot];
    if (row.fact_id !== fact.id || !target || row.ordinal !== target.length) throw new Error('daily_flow_fact_rows_invalid');
    target.push(row.slot === 'removedNodeIds' ? row.node_id : cycleRowSchema.parse({ node_id: row.node_id,
      order_key: row.order_key, active: row.active, cohort: row.cohort, handled: row.handled, initial_task: row.initial_task }));
  }
  return fact;
}
