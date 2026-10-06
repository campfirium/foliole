import type { ParentOrderVersion } from './syncParentOrderVersionGraph.js';

/** Validate reachable lineage without spending call-stack depth on version history. */
export function createParentOrderGraph(versions: readonly ParentOrderVersion[], headIds: readonly string[]) {
  if (!headIds.length || headIds.some((id) => !id)) throw new Error('sync_parent_order_heads_missing');
  const rows = new Map<string, ParentOrderVersion>();
  for (const version of versions) {
    if (!version.versionId || new Set(version.order).size !== version.order.length ||
        new Set(version.parentVersionIds).size !== version.parentVersionIds.length ||
        version.parentVersionIds.includes(version.versionId)) throw new Error('sync_parent_order_version_invalid');
    const previous = rows.get(version.versionId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(version)) {
      throw new Error('sync_parent_order_fact_collision');
    }
    rows.set(version.versionId, version);
  }
  const reachable = validateReachableLineage(rows, headIds);
  const cache = new Map<string, Set<string>>();
  const ancestors = (id: string) => {
    const held = cache.get(id);
    if (held) return held;
    const found = collectAncestors(rows, [id]);
    cache.set(id, found);
    return found;
  };
  const maximal = (ids: readonly string[]) => {
    const predecessors = collectAncestors(rows, ids.flatMap((id) => rows.get(id)!.parentVersionIds));
    return ids.filter((id) => !predecessors.has(id));
  };
  return { rows, reachable, ancestors, maximal };
}

function validateReachableLineage(rows: ReadonlyMap<string, ParentOrderVersion>, heads: readonly string[]) {
  const complete = new Set<string>();
  const visiting = new Set<string>();
  for (const head of heads) {
    const stack = [{ id: head, parentIndex: 0 }];
    while (stack.length) {
      const frame = stack.at(-1)!;
      if (complete.has(frame.id)) { stack.pop(); continue; }
      const row = rows.get(frame.id);
      if (!row) throw new Error('sync_parent_order_lineage_unproven');
      visiting.add(frame.id);
      const parent = row.parentVersionIds[frame.parentIndex++];
      if (parent !== undefined) {
        if (visiting.has(parent)) throw new Error('sync_parent_order_lineage_unproven');
        if (!complete.has(parent)) stack.push({ id: parent, parentIndex: 0 });
      } else {
        visiting.delete(frame.id);
        complete.add(frame.id);
        stack.pop();
      }
    }
  }
  return complete;
}

function collectAncestors(rows: ReadonlyMap<string, ParentOrderVersion>, starts: readonly string[]) {
  const found = new Set<string>();
  const pending = [...starts];
  while (pending.length) {
    const id = pending.pop()!;
    if (found.has(id)) continue;
    const row = rows.get(id);
    if (!row) throw new Error('sync_parent_order_lineage_unproven');
    found.add(id);
    for (const parent of row.parentVersionIds) pending.push(parent);
  }
  return found;
}
