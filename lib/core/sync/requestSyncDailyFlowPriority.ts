import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';

type Inventories = { local: readonly FramedSyncInventoryEntry[]; remote: readonly FramedSyncInventoryEntry[] };

/** Deliver learning operations and their existing node facts ahead of unrelated work. */
export function dailyFlowPriorityDifferences(inventories: Inventories, differences: readonly FramedSyncInventoryDifference[]) {
  const flows = differences.filter(item => item.objectType === 'daily_flow');
  const needed = new Set([...inventories.local, ...inventories.remote]
    .filter(entry => entry.objectType === 'daily_flow').flatMap(entry => entry.dailyFlowNodeIds ?? []));
  const selected = new Set(flows);
  for (const flow of flows) for (const id of flow.sourceSnapshot.dailyFlowNodeIds ?? []) needed.add(id);
  return differences.filter(item => item.objectType === 'node' ? needed.has(item.globalId) : selected.has(item))
    .sort((a, b) => rank(a) - rank(b));
}

function rank(item: FramedSyncInventoryDifference) {
  return item.objectType === 'daily_flow' ? 0 : 1;
}
