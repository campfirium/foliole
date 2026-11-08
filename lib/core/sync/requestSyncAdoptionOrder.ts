import type { FramedSyncInventoryDifference } from './framedSyncInventory.js';

/** Put selected parents before children without touching the canonical inventory order. */
export function orderAdoptionPulls(differences: readonly FramedSyncInventoryDifference[]) {
  const nodePulls = differences.filter(item => item.objectType === 'node');
  const nodes = new Set(nodePulls.map(item => item.globalId));
  const children = new Map<string, FramedSyncInventoryDifference[]>();
  const ready: FramedSyncInventoryDifference[] = [];
  for (const item of nodePulls) {
    const parent = item.sourceSnapshot.adoptionParentId;
    if (!parent || !nodes.has(parent)) {
      ready.push(item);
    } else {
      const waiting = children.get(parent) ?? [];
      waiting.push(item);
      children.set(parent, waiting);
    }
  }
  ready.reverse();
  const ordered: FramedSyncInventoryDifference[] = [];
  while (ready.length) {
    const item = ready.pop()!;
    ordered.push(item);
    const waiting = children.get(item.globalId) ?? [];
    for (let index = waiting.length - 1; index >= 0; index--) ready.push(waiting[index]!);
  }
  // A cycle or bad hint is still subject to the ordinary receive and dependency checks.
  if (ordered.length !== nodePulls.length) {
    const visited = new Set(ordered);
    for (const item of nodePulls) if (!visited.has(item)) ordered.push(item);
  }
  let next = 0;
  return differences.map(item => item.objectType === 'node' ? ordered[next++]! : item);
}
