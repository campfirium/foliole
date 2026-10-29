import { allocateCycleKey } from './cycleFlowState.js';
import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowSourceSettingsArgs } from './dailyFlowSourceSettings.js';
import type { CycleStored } from './dailyFlowStore.js';

/** A released topic may have been locked when the durable cycle was created. */
export function sourceSettingsReleasedRows(stored: CycleStored | null, rows: CycleRow[],
  readings: DailyFlowSourceSettingsArgs['readings']) {
  if (!stored?.session.cycle) return null;
  const cycle = { ...stored.session.cycle };
  const known = new Set(rows.map(row => row.node_id));
  const added: CycleRow[] = readings.filter(value => value.after === 'active' && !known.has(value.nodeId))
    .map(value => ({ node_id: value.nodeId, order_key: allocateCycleKey(cycle), active: 1,
      handled: 0, initial_task: 0, cohort: 'none' }));
  return added.length ? { rows: added, session: { ...stored.session, cycle } } : null;
}
