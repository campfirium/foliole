import { createParentOrderGraph } from './syncParentOrderGraph.js';
import { planParentOrderResolution, type ParentOrderResolutionPlan } from './syncParentOrderResolutionPlan.js';
import type { ParentOrderVersion } from './syncParentOrderVersionGraph.js';
import { mergeVersionedParentOrders } from './syncVersionedParentOrderMerge.js';

/** Resolve from original edits, so an earlier pairwise automatic merge has no extra vote. */
export function resolveParentOrderHeads(args: {
  versions: readonly ParentOrderVersion[];
  headIds: readonly string[];
  members: ReadonlySet<string>;
  compareAdded: (left: string, right: string) => number;
}) {
  const graph = createParentOrderGraph(args.versions, args.headIds);
  return resolvePlannedParentOrderHeads({ ...args, versions: graph.rows,
    plan: planParentOrderResolution(args.versions, args.headIds) });
}

export function resolvePlannedParentOrderHeads(args: {
  plan: ParentOrderResolutionPlan;
  versions: ReadonlyMap<string, ParentOrderVersion>;
  members: ReadonlySet<string>;
  compareAdded: (left: string, right: string) => number;
}) {
  const snapshot = (id: string) => {
    const version = args.versions.get(id);
    if (!version) throw new Error('sync_parent_order_lineage_unproven');
    return version;
  };
  const base = snapshot(args.plan.baseId);
  const facts = args.plan.facts.map((fact) => ({ ...fact, order: snapshot(fact.versionId).order }));
  const sources = args.plan.sourceVersionIds.map((id) => ({ versionId: id, order: snapshot(id).order }));
  const result = mergeVersionedParentOrders({ base: base.order, facts,
    sources, members: args.members, compareAdded: args.compareAdded });
  const inherited = args.plan.successorId ? snapshot(args.plan.successorId) : undefined;
  if (inherited && JSON.stringify(inherited.order) === JSON.stringify(result.order)) {
    return { ...result, version: inherited };
  }
  const parents = [...new Set(args.plan.sourceVersionIds)].sort();
  return { ...result, version: { versionId: `ord_merge_${result.mergeId}`, kind: 'merge',
    order: result.order, parentVersionIds: parents } satisfies ParentOrderVersion };
}
