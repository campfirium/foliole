/** Merge additions around unchanged common anchors without reordering either side's own additions. */
export function mergeParentChildOrders(left: readonly string[], right: readonly string[],
  compareAdded: (leftId: string, rightId: string) => number): string[] {
  if (new Set(left).size !== left.length || new Set(right).size !== right.length) {
    throw new Error('sync_parent_order_duplicate_child');
  }
  const leftIds = new Set(left);
  const rightIds = new Set(right);
  const common = left.filter((id) => rightIds.has(id));
  if (JSON.stringify(common) !== JSON.stringify(right.filter((id) => leftIds.has(id)))) {
    throw new Error('sync_parent_order_common_reordered');
  }
  const leftSlots = insertionSlots(left, new Set(common));
  const rightSlots = insertionSlots(right, new Set(common));
  const merged: string[] = [];
  for (let index = 0; index <= common.length; index += 1) {
    merged.push(...mergeSlot(leftSlots[index]!, rightSlots[index]!, compareAdded));
    if (index < common.length) merged.push(common[index]!);
  }
  return merged;
}

function insertionSlots(order: readonly string[], common: ReadonlySet<string>) {
  const slots: string[][] = [[]];
  for (const id of order) {
    if (common.has(id)) slots.push([]);
    else slots.at(-1)!.push(id);
  }
  return slots;
}

function mergeSlot(left: readonly string[], right: readonly string[],
  compareAdded: (leftId: string, rightId: string) => number) {
  const result: string[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (compareAdded(left[i]!, right[j]!) <= 0) result.push(left[i++]!);
    else result.push(right[j++]!);
  }
  return [...result, ...left.slice(i), ...right.slice(j)];
}
