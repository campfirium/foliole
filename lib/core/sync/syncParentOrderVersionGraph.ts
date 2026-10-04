import type { ParentOrderUserFact } from './syncVersionedParentOrderMerge.js';

export interface ParentOrderVersion {
  kind: 'baseline' | 'membership' | 'merge' | 'user';
  order: readonly string[];
  parentVersionIds: readonly string[];
  versionId: string;
}

function sameFact(left: ParentOrderVersion, right: ParentOrderVersion) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Keep original user edits until a causally later user edit replaces them. */
export function projectParentOrderUserFacts(versions: readonly ParentOrderVersion[],
  headIds: readonly string[]): ParentOrderUserFact[] {
  if (!headIds.length || headIds.some((id) => !id)) {
    throw new Error('sync_parent_order_heads_missing');
  }
  const byId = new Map<string, ParentOrderVersion>();
  for (const version of versions) {
    if (!version.versionId || new Set(version.order).size !== version.order.length ||
        new Set(version.parentVersionIds).size !== version.parentVersionIds.length ||
        version.parentVersionIds.includes(version.versionId)) {
      throw new Error('sync_parent_order_version_invalid');
    }
    const previous = byId.get(version.versionId);
    if (previous && !sameFact(previous, version)) {
      throw new Error('sync_parent_order_fact_collision');
    }
    byId.set(version.versionId, version);
  }
  const ancestors = new Map<string, Set<string>>();
  const visiting = new Set<string>();
  const visit = (id: string): Set<string> => {
    const cached = ancestors.get(id);
    if (cached) return cached;
    const version = byId.get(id);
    if (!version || visiting.has(id)) throw new Error('sync_parent_order_lineage_unproven');
    visiting.add(id);
    const result = new Set<string>();
    for (const parentId of version.parentVersionIds) {
      result.add(parentId);
      for (const ancestor of visit(parentId)) result.add(ancestor);
    }
    visiting.delete(id);
    ancestors.set(id, result);
    return result;
  };
  const reachable = new Set<string>();
  for (const headId of headIds) {
    reachable.add(headId);
    for (const ancestor of visit(headId)) reachable.add(ancestor);
  }
  const users = [...reachable].map((id) => byId.get(id)!)
    .filter((version) => version.kind === 'user');
  return users.map((version) => ({ versionId: version.versionId, order: version.order,
    supersedes: [...(ancestors.get(version.versionId) ?? [])]
      .filter((id) => byId.get(id)?.kind === 'user').sort() }))
    .sort((a, b) => a.versionId < b.versionId ? -1 : a.versionId > b.versionId ? 1 : 0);
}
