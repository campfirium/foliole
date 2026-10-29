import type { ReadingState } from '../review/readingState.js';

import { allocateCycleKey } from './cycleFlowState.js';
import type { CycleRow } from './cycleFlowTypes.js';
import type { CycleStored } from './dailyFlowStore.js';

/** A released topic may have been locked when the durable cycle was created. */
export function sourceSettingsReleasedRows(stored: CycleStored | null, rows: CycleRow[],
  readings: { nodeId: string; after: ReadingState | null }[], releasedRootNodeId?: string) {
  if (!stored?.session.cycle) return null;
  const cycle = { ...stored.session.cycle };
  const known = new Set(rows.map(row => row.node_id));
  const candidates = [...readings.filter(value => value.after === 'active'),
    ...(releasedRootNodeId ? [{ nodeId: releasedRootNodeId, after: 'active' as const }] : [])];
  const added: CycleRow[] = [...new Map(candidates.map(value => [value.nodeId, value])).values()].filter(value => !known.has(value.nodeId))
    .map(value => ({ node_id: value.nodeId, order_key: allocateCycleKey(cycle), active: 1,
      handled: 0, initial_task: 0, cohort: 'none' }));
  return added.length ? { rows: added, session: { ...stored.session, cycle } } : null;
}
