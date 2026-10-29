export interface DeletedChildParentOrder {
  parentNodeId: string | null;
  childIds: string[];
  manualChildIds?: string[];
}

/** Reinsert restored members around surviving old neighbors, retaining every other current slot. */
export function restoreDeletedChildOrder(
  current: readonly string[], saved: readonly string[], restored: ReadonlySet<string>
) {
  const members = new Set(current);
  const targets = new Set(saved.filter(id => restored.has(id) && members.has(id)));
  const retained = current.filter(id => !targets.has(id));
  const positions = new Map(retained.map((id, index) => [id, index]));
  const nextPositions = new Map<string, number>();
  let next = retained.length;
  for (const id of [...saved].reverse()) {
    nextPositions.set(id, next);
    next = positions.get(id) ?? next;
  }
  const slots = new Map<number, string[]>();
  let previous: number | undefined;
  let lastSlot = 0;
  for (const id of saved) {
    if (positions.has(id)) previous = positions.get(id)! + 1;
    if (!targets.has(id)) continue;
    const slot = Math.max(lastSlot, previous ?? nextPositions.get(id) ?? retained.length);
    const group = slots.get(slot) ?? [];
    group.push(id);
    slots.set(slot, group);
    lastSlot = slot;
  }
  return [...retained.flatMap((id, index) => [...slots.get(index) ?? [], id]),
    ...slots.get(retained.length) ?? []];
}
