import { cycleMeta } from './cycleFlowState.js';
import type { CycleChange, CycleMeta, CycleRow } from './cycleFlowTypes.js';

export function cycleChanges(meta: CycleMeta) {
  const source = cycleMeta(meta);
  const before = new Map<string, CycleRow | undefined>();
  const after = new Map<string, CycleRow>();
  function set(previous: CycleRow | undefined, next: CycleRow) {
    const latest = after.get(next.node_id) ?? previous;
    if (JSON.stringify(latest) === JSON.stringify(next)) return;
    if (!before.has(next.node_id)) before.set(next.node_id, previous);
    after.set(next.node_id, { ...next });
  }
  function change(): CycleChange {
    return { before: [...before.values()].filter((row): row is CycleRow => Boolean(row)),
      after: [...after.values()], source, target: cycleMeta(meta) };
  }
  return { set, rows: () => [...after.values()], change };
}
