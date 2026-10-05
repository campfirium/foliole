import { projectParentOrderUserFacts, type ParentOrderVersion } from './syncParentOrderVersionGraph.js';
import { mergeVersionedParentOrders } from './syncVersionedParentOrderMerge.js';

function ancestry(versions: readonly ParentOrderVersion[]) {
  const rows = new Map(versions.map((version) => [version.versionId, version]));
  const cache = new Map<string, Set<string>>();
  const pending = new Set<string>();
  const visit = (id: string): Set<string> => {
    const held = cache.get(id);
    if (held) return held;
    const row = rows.get(id);
    if (!row || pending.has(id)) throw new Error('sync_parent_order_lineage_unproven');
    pending.add(id);
    const found = new Set([id]);
    for (const parentId of row.parentVersionIds) for (const ancestor of visit(parentId)) found.add(ancestor);
    pending.delete(id);
    cache.set(id, found);
    return found;
  };
  return { rows, visit };
}

/** Resolve from original edits, so an earlier pairwise automatic merge has no extra vote. */
export function resolveParentOrderHeads(args: {
  versions: readonly ParentOrderVersion[];
  headIds: readonly string[];
  members: ReadonlySet<string>;
  compareAdded: (left: string, right: string) => number;
}) {
  const facts = projectParentOrderUserFacts(args.versions, args.headIds);
  const graph = ancestry(args.versions);
  const reachable = new Set(args.headIds.flatMap((id) => [...graph.visit(id)]));
  const originals = args.versions.filter((version) => reachable.has(version.versionId) &&
    (version.kind === 'user' || version.kind === 'membership'));
  const tips = originals.filter((version) => !originals.some((other) =>
    other.versionId !== version.versionId && graph.visit(other.versionId).has(version.versionId)));
  const superseded = new Set(facts.flatMap((fact) => [...(fact.supersedes ?? [])]));
  const activeUsers = facts.filter((fact) => !superseded.has(fact.versionId));
  const sourceIds = activeUsers.length ? [
    ...activeUsers.map((version) => version.versionId),
    ...tips.filter((tip) => !activeUsers.some((user) => graph.visit(tip.versionId)
      .has(user.versionId))).map((tip) => tip.versionId)
  ] : tips.map((version) => version.versionId);
  const baseHeads = sourceIds.length ? sourceIds : args.headIds;
  const firstId = baseHeads[0];
  if (!firstId) throw new Error('sync_parent_order_heads_missing');
  const common = [...graph.visit(firstId)].filter((id) =>
    baseHeads.every((head) => graph.visit(head).has(id)));
  const maximal = common.filter((id) => !common.some((other) =>
    other !== id && graph.visit(other).has(id))).sort();
  const baseId = maximal[0];
  if (!baseId) throw new Error('sync_parent_order_common_base_missing');
  const base = graph.rows.get(baseId);
  if (!base) throw new Error('sync_parent_order_lineage_unproven');
  const sources = (tips.length ? tips : [base]).map((version) => ({
    versionId: version.versionId, order: version.order
  }));
  const result = mergeVersionedParentOrders({ base: base.order, facts,
    sources, members: args.members, compareAdded: args.compareAdded });
  const successor = args.headIds.find((id) => args.headIds.every((other) => graph.visit(id).has(other)));
  const inherited = successor ? graph.rows.get(successor) : undefined;
  if (inherited && JSON.stringify(inherited.order) === JSON.stringify(result.order)) {
    return { ...result, version: inherited };
  }
  const parents = [...new Set(tips.length ? tips.map((version) => version.versionId) : [baseId])].sort();
  return { ...result, version: { versionId: `ord_merge_${result.mergeId}`, kind: 'merge',
    order: result.order, parentVersionIds: parents } satisfies ParentOrderVersion };
}
