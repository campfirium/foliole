import { createParentOrderLineageGraph, type ParentOrderLineage } from './syncParentOrderGraph.js';
import { projectParentOrderUserLineage } from './syncParentOrderVersionGraph.js';

/** Select real snapshot identities from the original lineage and user-edit rules. */
export function planParentOrderResolution(versions: readonly ParentOrderLineage[], headIds: readonly string[]) {
  const graph = createParentOrderLineageGraph(versions, headIds);
  const facts = projectParentOrderUserLineage(graph);
  const originals = versions.filter((version) => graph.reachable.has(version.versionId) &&
    (version.kind === 'user' || version.kind === 'membership'));
  const tipIds = new Set(graph.maximal(originals.map((version) => version.versionId)));
  const tips = originals.filter((version) => tipIds.has(version.versionId));
  const superseded = new Set(facts.flatMap((fact) => fact.supersedes));
  const activeUsers = facts.filter((fact) => !superseded.has(fact.versionId));
  const sourceIds = activeUsers.length ? [
    ...activeUsers.map((version) => version.versionId),
    ...tips.filter((tip) => !activeUsers.some((user) => graph.ancestors(tip.versionId)
      .has(user.versionId))).map((tip) => tip.versionId)
  ] : tips.map((version) => version.versionId);
  const baseHeads = sourceIds.length ? sourceIds : headIds;
  const firstId = baseHeads[0];
  if (!firstId) throw new Error('sync_parent_order_heads_missing');
  const common = [...graph.ancestors(firstId)].filter((id) =>
    baseHeads.every((head) => graph.ancestors(head).has(id)));
  const baseId = graph.maximal(common).sort()[0];
  if (!baseId) throw new Error('sync_parent_order_common_base_missing');
  const successorId = headIds.find((id) => headIds.every((other) => graph.ancestors(id).has(other)));
  const sourceVersionIds = tips.length ? tips.map((version) => version.versionId) : [baseId];
  return { baseId, facts, sourceVersionIds, successorId,
    requiredVersionIds: new Set([...headIds, baseId, ...sourceVersionIds, ...facts.map((fact) => fact.versionId)]) };
}

export type ParentOrderResolutionPlan = ReturnType<typeof planParentOrderResolution>;
