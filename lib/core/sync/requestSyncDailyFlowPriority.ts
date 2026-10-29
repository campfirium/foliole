import type { FramedSyncInventoryDifference, FramedSyncInventoryEntry } from './framedSyncInventory.js';

type Inventories = { local: readonly FramedSyncInventoryEntry[]; remote: readonly FramedSyncInventoryEntry[] };

/** Keep the current list's existing atomic node objects ahead of unrelated database work. */
export function dailyFlowPriorityDifferences(inventories: Inventories, differences: readonly FramedSyncInventoryDifference[]) {
  const current = [...inventories.local, ...inventories.remote].filter(entry => entry.dailyFlowCurrent);
  const roots = new Set(current.map(entry => entry.dailyFlowRootId));
  const needed = new Set(current.flatMap(entry => entry.dailyFlowNodeIds ?? []));
  const flows = differences.filter(item => item.objectType === 'daily_flow' && roots.has(item.sourceSnapshot.dailyFlowRootId));
  const selected = new Set(flows);
  for (const flow of flows) for (const id of flow.sourceSnapshot.dailyFlowNodeIds ?? []) needed.add(id);
  return differences.filter(item => item.objectType === 'node' ? needed.has(item.globalId) : selected.has(item))
    .sort((a, b) => rank(a) - rank(b));
}

function rank(item: FramedSyncInventoryDifference) {
  return item.objectType === 'node' ? 0 : item.sourceSnapshot.dailyFlowCurrent ? 2 : 1;
}
